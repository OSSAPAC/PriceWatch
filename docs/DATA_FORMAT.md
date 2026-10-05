# Data format

PriceWatch keeps all data in three CSV files in the `data` folder. Each file is UTF-8, with a header row and comma-separated values. Values that contain commas, quotes or line breaks are wrapped in double quotes, with inner quotes doubled (standard CSV).

Columns are matched by their header name, so their order doesn't matter. Unknown extra columns are ignored when reading but **dropped** the next time the app saves.

## data/shops.csv

One row per shop.

| Column | Required | Description |
|---|---|---|
| `id` | yes | Short unique name used by the other files, such as `aldi-burwood`. Lowercase letters, digits and hyphens. Don't change it once prices use it. |
| `name` | yes | Name shown in the app. Can be changed freely. |
| `color` | no | Colour used in charts, as `#RRGGBB`. Picked automatically if empty. |

## data/items.csv

One row per product you track.

| Column | Required | Description |
|---|---|---|
| `id` | yes | Short unique name, such as `full-cream-milk-2l`. Don't change it once prices use it. |
| `name` | yes | Name shown in the app. Including brand and size helps tell products apart. |
| `only_at_shop_id` | no | The `id` of the only shop that sells this item, such as a shop's own brand. Empty means it can be sold anywhere. |
| `compare_by` | no | How prices for this item are compared: `kg` (per kilogram), `L` (per litre) or `each` (per item). Empty means `each`. |

Name items without the pack size (`Full Cream Milk`, not `Full Cream Milk 2L`) so the same product in different pack sizes is one item, compared per kg, litre or item.

Prices recorded for an `only_at_shop_id` item at a different shop are ignored in all comparisons. The item's page in the app lists them so you can fix them.

## data/prices.csv

One row per price seen.

| Column | Required | Description |
|---|---|---|
| `date` | yes | Date of the bill or of when you saw the price, as `YYYY-MM-DD`. |
| `shop_id` | yes | An `id` from `shops.csv`. |
| `item_id` | yes | An `id` from `items.csv`. |
| `price` | yes | What was paid for one pack, or the line total for something weighed, with two decimals, such as `3.10`. No currency symbol. |
| `amount` | no | How much the price is for, such as `2`, `500` or `0.85`. Empty means `1`. |
| `unit` | no | Unit of `amount`: `g`, `kg`, `ml`, `L` or `each`. Empty means `each`. |
| `source` | yes | `bill` if you bought it, `shelf` if you only saw the price (shelf tag, price list or catalogue). |

Rows with a missing or invalid date, an unknown shop or item, or a price that isn't above zero are skipped when loading.

### How unit prices are worked out

The app divides `price` by `amount`, converted to the item's `compare_by` unit:

| Row | Item compared by | Unit price |
|---|---|---|
| `3.10,2,L` | `L` | 3.10 ÷ 2 = **1.55 per litre** |
| `2.25,500,g` | `kg` | 2.25 ÷ 0.5 = **4.50 per kg** |
| `3.40,0.85,kg` | `kg` | 3.40 ÷ 0.85 = **4.00 per kg** |
| `6.00,12,each` | `each` | 6.00 ÷ 12 = **0.50 per item** |
| `3.00,1,each` | `kg` | can't be compared (no weight); left out and flagged in the app |

`g` and `kg` convert to each other, as do `ml` and `L`. Weight, volume and count can't be converted to each other.

### Files from older versions

Older files have no `amount`, `unit` or `compare_by` columns. They still load: every price counts as one item, and every item is compared per item. The columns are added the next time the app saves.

The same item can appear more than once on the same day at the same shop. The app uses the last one. Rows are kept sorted by date, then shop, then item, which keeps changes easy to read in Git history.

## What is not stored

Photos, bill totals, how many packs you bought, discounts and receipt text are never stored. The monthly basket used by the Forecast tab is kept in each person's browser, not in these files.

## Editing by hand

You can edit the files on GitHub or in a spreadsheet. Save them as CSV (UTF-8) and keep the header row. If you rename an `id`, update it everywhere it's used in the other files.
