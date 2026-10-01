'use strict';

const fs = require('node:fs');
const path = require('node:path');

const workspaceRoot = path.resolve(__dirname, '../..');
const logDirectory = path.join(workspaceRoot, '.agent-logs');
const modelName = process.env.AGENT_LOG_MODEL || 'not exposed by Local hook';
const authorName = process.env.AGENT_LOG_AUTHOR || 'muhammad-waqar-uit';

function readEvent() {
  return new Promise((resolve, reject) => {
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { input += chunk; });
    process.stdin.on('end', () => {
      try {
        resolve(JSON.parse(input));
      } catch (error) {
        reject(error);
      }
    });
    process.stdin.on('error', reject);
  });
}

function parseTranscript(contents) {
  return contents
    .split(/\r?\n/)
    .filter(line => line.trim().length > 0)
    .map(line => JSON.parse(line));
}

function extractFinalResponse(contents) {
  const records = parseTranscript(contents);
  let latestUserIndex = -1;

  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (records[index].type === 'user.message') {
      latestUserIndex = index;
      break;
    }
  }

  if (latestUserIndex < 0) {
    return '';
  }

  for (let index = records.length - 1; index > latestUserIndex; index -= 1) {
    const record = records[index];
    if (record.type === 'assistant.message' && typeof record.data?.content === 'string') {
      return record.data.content;
    }
  }

  return '';
}

function getSessionId(event, records = []) {
  const transcriptSession = records.find(record => record.type === 'session.start')?.data?.sessionId;
  return event.session_id || transcriptSession || 'unknown-session';
}

function getLogPath(sessionId, timestamp) {
  fs.mkdirSync(logDirectory, { recursive: true });
  const suffix = `_${sessionId}.md`;
  const existing = fs.readdirSync(logDirectory).find(name => name.endsWith(suffix));
  if (existing) {
    return path.join(logDirectory, existing);
  }

  const date = new Date(timestamp);
  const filenameTime = date.toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
  return path.join(logDirectory, `${filenameTime}_${sessionId}.md`);
}

function quoteYaml(value) {
  return JSON.stringify(String(value).replace(/[\r\n]+/g, ' '));
}

function startLog(logPath, event, sessionId, prompt) {
  const timestamp = event.timestamp || new Date().toISOString();
  const date = timestamp.slice(0, 10);
  const project = path.basename(event.cwd || workspaceRoot);
  const header = [
    '---',
    `session_id: ${quoteYaml(sessionId)}`,
    `date: ${quoteYaml(date)}`,
    `author: ${quoteYaml(authorName)}`,
    `model: ${quoteYaml(modelName)}`,
    'tool: "github-copilot-vscode-local"',
    `project: ${quoteYaml(project)}`,
    'total_exchanges: 0',
    `first_prompt_time: ${quoteYaml(timestamp)}`,
    `last_prompt_time: ${quoteYaml(timestamp)}`,
    '---',
    '',
    `# Session Log - ${date}`,
    '',
    `Session: \`${sessionId.slice(0, 8)}\` | Project: \`${project}\` | Author: ${authorName}`,
    '',
    '---',
    ''
  ].join('\n');

  fs.writeFileSync(logPath, header, { flag: 'wx' });
  appendEntry(logPath, 'PROMPT', 1, sessionId, timestamp, prompt);
}

function appendEntry(logPath, type, number, sessionId, timestamp, text) {
  const entry = [
    `[LOG_ENTRY type=${type} num=${number} session=${sessionId}]`,
    `timestamp: ${timestamp}`,
    `model: ${modelName}`,
    '',
    text,
    '',
    ''
  ].join('\n');
  fs.appendFileSync(logPath, entry);
}

function countEntries(contents, type) {
  return (contents.match(new RegExp(`^\\[LOG_ENTRY type=${type} `, 'gm')) || []).length;
}

function handlePrompt(event) {
  if (typeof event.prompt !== 'string') {
    throw new Error('UserPromptSubmit event did not include prompt text');
  }

  const sessionId = getSessionId(event);
  const logPath = getLogPath(sessionId, event.timestamp || new Date().toISOString());
  if (fs.existsSync(logPath)) {
    const existing = fs.readFileSync(logPath, 'utf8');
    const number = countEntries(existing, 'PROMPT') + 1;
    appendEntry(logPath, 'PROMPT', number, sessionId, event.timestamp || new Date().toISOString(), event.prompt);
    const lastPrompt = quoteYaml(event.timestamp || new Date().toISOString());
    const updated = fs.readFileSync(logPath, 'utf8')
      .replace(/^last_prompt_time: .*$/m, `last_prompt_time: ${lastPrompt}`);
    fs.writeFileSync(logPath, updated);
  } else {
    startLog(logPath, event, sessionId, event.prompt);
  }
}

function handleStop(event) {
  if (typeof event.transcript_path !== 'string' || !fs.existsSync(event.transcript_path)) {
    throw new Error('Stop event did not provide a readable transcript_path');
  }

  const contents = fs.readFileSync(event.transcript_path, 'utf8');
  const records = parseTranscript(contents);
  const sessionId = getSessionId(event, records);
  const latestPrompt = records.slice().reverse().find(record => record.type === 'user.message');
  if (!latestPrompt || typeof latestPrompt.data?.content !== 'string') {
    throw new Error('Transcript did not contain the latest user prompt');
  }

  const logPath = getLogPath(sessionId, event.timestamp || new Date().toISOString());
  if (!fs.existsSync(logPath)) {
    throw new Error('Prompt log is missing; refusing to create an unpaired response');
  }

  const existing = fs.readFileSync(logPath, 'utf8');
  const promptCount = countEntries(existing, 'PROMPT');
  const responseCount = countEntries(existing, 'RESPONSE');
  if (responseCount >= promptCount) {
    return;
  }

  const response = extractFinalResponse(contents);
  if (!response) {
    throw new Error('Transcript did not contain a visible final assistant message');
  }

  const timestamp = event.timestamp || new Date().toISOString();
  appendEntry(logPath, 'RESPONSE', promptCount, sessionId, timestamp, response);
  const updated = fs.readFileSync(logPath, 'utf8')
    .replace(/^total_exchanges: .*$/m, `total_exchanges: ${promptCount}`);
  fs.writeFileSync(logPath, updated);
}

async function main() {
  const event = await readEvent();
  if (event.hook_event_name === 'UserPromptSubmit') {
    handlePrompt(event);
  } else if (event.hook_event_name === 'Stop') {
    handleStop(event);
  }
}

if (require.main === module) {
  main().catch(error => {
    process.stderr.write(`Agent capture hook: ${error.message}\n`);
  });
}

module.exports = { extractFinalResponse, parseTranscript };