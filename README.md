# 🛒 PriceWatch

Find out which grocery shop is really cheaper.

Snap a bill when you buy, or the shelf tags when you only look. PriceWatch turns each photo into dated prices per shop, so over time you can see:

- **Which shop is cheapest**, based on items you've priced at more than one shop, compared per kg, per litre or per item so different pack sizes are fair
- **How prices are moving** at each shop
- **What your usual monthly shopping would cost** at each shop, now and next month
- **Items only one shop sells** (like its own brand), kept separate so they're never compared unfairly

Your prices are stored as plain CSV files in your own GitHub repository. You can open them in Excel or Google Sheets, see every change in the history, and share them with others. Only prices and the pack size or weight they're for are stored. Photos, bill totals and how many packs you bought are not.

---

## Contents

- [Set up your own copy](#set-up-your-own-copy) (about 10 minutes)
- [Using the app](#using-the-app)
- [Sharing](#sharing)
- [Your data](#your-data)
- [Privacy and security](#privacy-and-security)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)

---

## Set up your own copy

You need a free [GitHub account](https://github.com/signup). Nothing needs to be installed on your computer or phone.

### 1. Copy the project

1. Open the PriceWatch repository on GitHub.
2. Click **Use this template**, then **Create a new repository**.
3. Name it `pricewatch` (or anything you like).
4. Choose **Public**. GitHub Pages, which hosts the app, is free only for public repositories. If you'd rather keep your prices private, see [Keeping your prices private](#keeping-your-prices-private).
5. Click **Create repository**.

### 2. Turn on the website

1. In your new repository, go to **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose the **main** branch and the **/ (root)** folder, then click **Save**.
4. Wait a minute or two, then refresh the page. Your app's link appears at the top, for example `https://your-name.github.io/pricewatch/`.

### 3. Create a GitHub token

The token lets the app save prices to your repository. It only works for the repository you choose.

1. Open [**Create a fine-grained token**](https://github.com/settings/personal-access-tokens/new). You can also get there from **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. **Token name:** `PriceWatch`.
3. **Expiration:** choose how long it should last. You'll make a new one when it expires.
4. **Repository access:** choose **Only select repositories**, then pick your `pricewatch` repository.
5. **Permissions → Repository permissions → Contents:** choose **Read and write**.
6. Click **Generate token** and copy it. It starts with `github_pat_`. GitHub shows it only once.

### 4. Connect the app

1. Open your app's link.
2. Go to **Settings**. Owner and Repository are filled in for you when the app runs on GitHub Pages.
3. Paste your token into **GitHub token** and click **Save and connect**.

The top of the app now says **Saved to your-name/pricewatch**.

### 5. Optional: read prices from photos

Without this you type prices by hand, which works fine. With it, the app reads prices from your photos for you.

1. Create an Anthropic API key. See the [Claude API documentation](https://docs.claude.com/en/api/overview). Each photo read is billed to your Anthropic account, usually a small amount per photo.
2. In the app, go to **Settings → Reading prices from photos**, paste the key and click **Save photo reading**.

### 6. Put it on your phone

Open your app's link on your phone.

- **iPhone (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap ⋮, then **Add to Home screen**.

Your token and API key are saved separately on each device, so repeat step 4 (and step 5 if you use it) on your phone.

---

## Using the app

### Add your shops

Go to **Shops** and add each shop you visit. If two branches of the same chain have different prices, add them as separate shops, such as "Coles Strathfield" and "Coles Burwood".

### Add prices

1. Go to **Add prices**.
2. Choose the **shop** and the **date**. The date is what puts prices in the right place on your timeline. When a bill shows its date, the app uses that date.
3. Choose where the prices are from:
   - **A bill** for things you bought
   - **Shelf or price list** for prices you only looked at
4. Take or choose photos and tap **Read prices from photo**, or tap **Type prices by hand**.
5. Check each line:
   - **Track as** links the line to an item you already track, so its price history stays together. Pick **New item** to add it to your list.
   - **Price paid** is what one pack cost, or the line total for something weighed.
   - **Amount** is what that price is for: `500 g`, `2 L`, `0.85 kg`, `12 items`, or `1 items` for something with no size. The **Unit price** next to it shows the result, such as `$1.55/L`.
   - Tick **Only here** for things only this shop sells, such as a shop's own brand. These items are never compared with other shops.
6. Tap **Save prices**. Each save is one commit in your repository.

The photo is used only to read prices. It isn't uploaded to GitHub.

### See the results

| Tab | What it shows |
|---|---|
| **Compare** | Shops ranked from cheapest, the items with the biggest price differences, how prices are changing, and items only one shop sells |
| **Prices** | Every item with its latest price at each shop. Open an item to see its price chart, rename it, mark where it's sold, or merge duplicates |
| **History** | Every visit by date. Open one to fix or delete its prices |
| **Forecast** | Your monthly basket and what it would cost at each shop, now and next month |

### Tips

- **Name items without the pack size**, for example "Full Cream Milk" rather than "Full Cream Milk 2L". Then a 2 L bottle at one shop and a 3 L bottle at another are the same item, compared per litre. Photo reading does this for you.
- **How an item is compared** (per kg, per litre or per item) is set from its first price. Change it under **Prices**, then open the item. If a price's amount is in a different unit, such as a price for tomatoes with no weight, the app asks you to fix it before saving.
- **Same product, two names?** Open one of them in **Prices** and use **Merge into it**.
- **Comparing fairly:** the ranking only uses items you've priced at two or more shops. Pricing a few of the same staples (milk, bread, eggs) at each shop gives the clearest picture.
- **Next-month forecast:** it follows each shop's price trend for an item once that item has 3 or more prices at the shop over at least 3 weeks. Before that, it uses the latest price.
- **Your basket** in Forecast is how much you use in a month, in kg, litres or items, for example 8 L of milk or 1.5 kg of tomatoes. It's kept on your device only and isn't saved to GitHub.

---

## Sharing

### Let others look at your prices

If your repository is public, send them your app's link. They can view everything without signing in, but can't change anything.

### Track prices together (family or housemates)

Everyone saves into the same repository.

1. In the repository, go to **Settings → Collaborators** and invite each person.
2. Each person creates their own token and adds it in the app's **Settings**.

> **Note:** GitHub's fine-grained tokens can't be used on someone else's personal repository. Collaborators can use either of these instead:
>
> - **A classic token.** Create one at [**Generate new token (classic)**](https://github.com/settings/tokens/new) with the `public_repo` scope (or `repo` if the repository is private).
> - **A shared organization.** Create a free [GitHub organization](https://github.com/organizations/plan), move the repository into it, and everyone can use fine-grained tokens.

If two people save at the same moment, the app combines both changes. Nothing is lost. To see other people's latest prices, tap **Refresh** at the top.

### Give someone their own copy

Send them the link to this project. They follow [Set up your own copy](#set-up-your-own-copy) and get their own empty app and data.

---

## Your data

Your prices live in the `data` folder of your repository as three CSV files:

| File | Columns | Example |
|---|---|---|
| `data/shops.csv` | `id,name,color` | `aldi-burwood,Aldi Burwood,#2D7A4D` |
| `data/items.csv` | `id,name,only_at_shop_id,compare_by` | `full-cream-milk,Full Cream Milk,,L` |
| `data/prices.csv` | `date,shop_id,item_id,price,amount,unit,source` | `2026-10-05,aldi-burwood,full-cream-milk,3.10,2,L,bill` |

- `price` is what was paid for one pack, or the line total for something weighed.
- `amount` and `unit` say what that price is for. `unit` is `g`, `kg`, `ml`, `L` or `each`.
- `compare_by` is how the item's prices are compared: `kg`, `L` or `each`.
- `source` is `bill` (you bought it) or `shelf` (you only saw the price).
- `only_at_shop_id` is empty for items sold anywhere.
- How many packs you bought is not stored.

You can edit these files directly on GitHub or in a spreadsheet, as long as the column names stay the same. The full description is in [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md).

**Backups:** every save is a commit, so GitHub keeps your full history. You can also download the files from **Settings → Download the CSV files**.

---

## Privacy and security

- **What's stored:** shop names, item names, dates, prices and the pack size or weight each price is for. Photos, bill totals, how many packs you bought and receipt details are never stored.
- **Public repository = public prices.** Anyone can see the CSV files in a public repository.
- **Your token and API key** are saved only in your browser on that device. They're never written to the repository.
  - Anyone who uses your browser could use them, so don't save them on shared computers.
  - Other GitHub Pages sites under your account share browser storage with this one. Only connect from your own sites.
  - Use **Settings → Forget keys on this device** when you're done on a device. You can also revoke the token on GitHub at any time.
  - Give the token access to this one repository only, with only Contents access.

### Keeping your prices private

GitHub Pages is free only for public repositories, but your data can live in a different repository from the app:

1. Keep the app repository public, with Pages turned on as above.
2. Create a second, **private** repository for your data, for example `pricewatch-data`. Add any file to it, such as a README, so it isn't empty.
3. Give your token access to the private repository.
4. In the app's **Settings**, change **Repository** to `pricewatch-data` and click **Save and connect**.

The app creates the `data` folder in the private repository the first time you save.

---

## Troubleshooting

| What you see | What to do |
|---|---|
| “GitHub didn’t accept the token” | The token has expired or was copied incompletely. Create a new one (step 3) and paste it again. |
| “The token can’t change …” | Edit the token on GitHub. Make sure it includes this repository and has **Contents: Read and write**. |
| “Can’t find …” | Check **Owner**, **Repository** and **Branch** in Settings. For a private repository, a token is needed even to view it. |
| “… is empty” | The repository has no files yet. Add any file on GitHub, such as a README, and try again. |
| The app link shows a 404 page | GitHub Pages takes a few minutes the first time. Check **Settings → Pages** shows your site as live. |
| Someone else's new prices don't show | Tap **Refresh** at the top of the app. |
| “The model … wasn’t found” | In **Settings → Reading prices from photos**, enter a current model name from the [Claude API documentation](https://docs.claude.com/en/api/overview). |
| Photo reading misses items | Take the photo straight on, in good light, with the prices in focus. You can always add or fix lines before saving. |
| A line shows “Needs a weight” | The item is compared per kg but the line has no weight. Enter the weight (such as `0.85` `kg`), or change how the item is compared under **Prices**. |
| A price shows “Can’t compare” | It was saved before the item's comparison unit changed. Open the visit in **History**, choose **Edit prices**, and fix its amount. |

---

## For developers

The app is plain HTML, CSS and JavaScript. There's no build step and no runtime dependencies.

```
index.html          Page layout and tabs
css/styles.css      All styles (light and dark mode)
js/app.js           User interface
js/data.js          CSV format, changes, and price analysis (pure functions, no browser code)
js/store.js         Saving and loading: GitHub, read-only, or this browser
js/reader.js        Reading prices from photos with the Anthropic API
data/*.csv          Your data
docs/DATA_FORMAT.md Data file reference
tests/              Tests (Node's built-in test runner)
```

### Run it locally

```bash
npm start      # serves the app at http://localhost:8080
npm test       # runs the tests (Node 18 or newer)
```

Opening `index.html` directly from your files won't work, because browsers block JavaScript modules on `file://` pages. Use `npm start`, or `python3 -m http.server 8080`. Locally, choose **This browser only** in Settings to try things out without GitHub, or connect to a repository as usual.

### How saving works

Every change is a small operation, such as `addPrices`, `mergeItems` or `deleteVisit` (see `applyOps` in `js/data.js`). When you save, the app:

1. Reads the latest CSV files from the repository.
2. Applies the operations.
3. Writes all changed files in a single commit.

If someone else committed in the meantime, GitHub rejects the update and the app starts over from step 1. This is how two people can save at once without losing anything. The tests in `tests/store.test.js` cover this with a fake GitHub API.

### Making changes

- Keep `js/data.js` free of browser code so it stays testable, and add a test for any new operation or calculation.
- If you change the CSV columns, update `HEADERS`, `parseData` and `serialize` together. Keep reading the old columns so existing data still loads, and update `docs/DATA_FORMAT.md`.
- Tests run automatically on every push and pull request (`.github/workflows/test.yml`).

### Getting updates into your copy

A copy made from the template doesn't update by itself. To pick up a newer version, copy everything **except the `data` folder** from the original project into your repository.

## License

MIT. See [LICENSE](LICENSE).
