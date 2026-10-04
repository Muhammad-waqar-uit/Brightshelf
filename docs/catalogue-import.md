# Real inventory import

The demo catalogue is synthetic and never represents available merchandise.
Import only inventory that Brightshelf is authorized to list, including its
descriptions and images. Imported inventory receives a source namespace and
external source IDs so repeat imports update the same database products rather
than creating duplicates.

## Input schema

Pass a JSON document with one vendor/source name and 1-1,000 products. Prices
are decimal dollar amounts with at most two decimal places. Image URLs must use
HTTPS. Every product requires a positive available-stock count or zero.

```json
{
  "source": "approved-inventory-feed",
  "products": [
    {
      "sourceId": "lamp-001",
      "title": "Desk lamp",
      "description": "A desk lamp supplied by the approved inventory feed.",
      "category": "Lighting",
      "price": 24.5,
      "thumbnailUrl": "https://images.example.com/lamp.jpg",
      "images": ["https://images.example.com/lamp.jpg"],
      "brand": "Northlight",
      "stock": 12
    }
  ]
}
```

`thumbnailUrl`, `images`, and `brand` may be omitted. Each source ID must be
unique within the document. The synthetic demo source name is reserved and is
rejected. Product records absent from an import are not deleted or archived;
set their stock to zero or archive them through an approved catalogue
maintenance workflow.

## Import

Set the API's `DATABASE_URL` to the intended development database, save the
validated document at the repository root as `inventory.json`, then run:

```sh
npm run import:inventory --workspace api -- --file=../inventory.json --confirm-inventory-import
```

The npm workspace runs the importer with `api/` as its working directory, so
the relative path above points to the repository-root file. The import file may
contain supplier data; keep it private and remove it after the approved import.

The importer validates the complete document before writing, limits input to
10 MiB, and upserts in one transaction. It refuses to overwrite seller-owned
listings or change stock while an affected product has a pending Stripe
checkout. Imported rows are published, seller-neutral inventory and checkout
reserves their stock. Review records in the database before treating them as
available to buyers.

## Synthetic checkout guard

API configuration defaults `ALLOW_SYNTHETIC_CHECKOUT=false`. Set it to `true`
only in a development or test environment when intentionally exercising the
fictional catalogue. Production always rejects synthetic checkout regardless
of the setting. Seller listings and imported real inventory are unaffected by
this opt-in.
