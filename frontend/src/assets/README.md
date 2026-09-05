# Hero imagery guidelines

The themed hero banners use gradient backgrounds by default. To restore photographic imagery similar to the Google Sites mockup, add your own JPG assets in this folder with the following filenames and recommended dimensions (minimum 1920×1080, 16:9 aspect ratio):

| Page | Filename | Recommended dimensions |
| --- | --- | --- |
| Dashboard | `dashboard-hero.jpg` | 1920 × 1080 |
| Events | `events-hero.jpg` | 1920 × 1080 |
| Shop | `shop-hero.jpg` | 1920 × 1080 |
| Rewards | `rewards-hero.jpg` | 1920 × 1080 |
| Feedback | `feedback-hero.jpg` | 1920 × 1080 |
| QR Scanner | `qr-hero.jpg` | 1920 × 1080 |

After placing the images, update the matching `.page-hero--<page>` classes in `src/App.css` to reference the new files, for example:

```css
.page-hero--dashboard {
  background: url("./dashboard-hero.jpg") center/cover no-repeat;
}
```

You can keep the existing gradient as a fallback by layering it with the image if desired.
