const demoCategories = [
  {
    name: 'Home and Office',
    items: ['desk organizer', 'cable keeper', 'document tray', 'monitor riser', 'pen holder'],
  },
  {
    name: 'Kitchen and Dining',
    items: ['mixing bowl', 'serving board', 'storage jar', 'utensil holder', 'table runner'],
  },
  {
    name: 'Lighting',
    items: ['table lamp', 'reading light', 'wall light', 'desk light', 'night light'],
  },
  {
    name: 'Storage',
    items: ['storage basket', 'shelf bin', 'drawer divider', 'folding crate', 'closet organizer'],
  },
  {
    name: 'Travel',
    items: ['packing cube', 'travel pouch', 'luggage tag', 'document wallet', 'weekender bag'],
  },
  {
    name: 'Garden',
    items: ['planter pot', 'garden trowel', 'watering can', 'seed tray', 'plant marker set'],
  },
  {
    name: 'Personal Care',
    items: ['toiletry pouch', 'mirror stand', 'cotton jar', 'brush holder', 'travel soap case'],
  },
  {
    name: 'Tech Accessories',
    items: ['device stand', 'charging dock', 'keyboard rest', 'headphone hook', 'cable sleeve'],
  },
  {
    name: 'Home Decor',
    items: ['picture frame', 'decorative vase', 'cushion cover', 'shelf ornament', 'wall hook set'],
  },
  {
    name: 'Outdoor Living',
    items: ['picnic blanket', 'camp mug', 'folding seat', 'lantern cover', 'cooler tote'],
  },
] as const;

const descriptors = [
  'Everyday',
  'Compact',
  'Simple',
  'Classic',
  'Versatile',
  'Lightweight',
  'Foldable',
  'Minimal',
  'Practical',
  'Colorful',
  'Textured',
  'Modern',
  'Travel-ready',
  'Space-saving',
  'Soft-touch',
  'Stackable',
  'Easy-care',
  'Adjustable',
  'Reusable',
  'Low-profile',
  'Multi-use',
  'Rounded',
  'Natural-tone',
  'Small-space',
  'Weekend',
  'Desk-side',
  'Room-friendly',
  'Daily-use',
  'Streamlined',
  'Brightshelf',
] as const;

const productCount = 300;
const source = 'brightshelf-synthetic-demo';

export function createDemoProducts() {
  return Array.from({ length: productCount }, (_, index) => {
    const category = demoCategories[index % demoCategories.length];
    const descriptor = descriptors[Math.floor(index / demoCategories.length) % descriptors.length];
    const item = category.items[Math.floor(index / demoCategories.length) % category.items.length];
    const sequence = String(index + 1).padStart(3, '0');
    const price = Number((5 + ((index * 137) % 2450) / 100).toFixed(2));

    return {
      source,
      sourceId: sequence,
      title: `${descriptor} ${item} ${sequence}`,
      description: `Fictional Brightshelf demonstration listing for a ${item} in the ${category.name} collection. The displayed price is illustrative; this item is not a real product and is not available for purchase.`,
      category: category.name,
      price,
      thumbnailUrl: null,
      images: [],
      brand: null,
    };
  });
}

export const demoProductSource = source;
