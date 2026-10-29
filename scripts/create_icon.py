from PIL import Image, ImageDraw, ImageFont
from pathlib import Path

root = Path(__file__).resolve().parents[1] / "assets" / "images"
size = 1024
img = Image.new("RGBA", (size, size), "#0f766e")
d = ImageDraw.Draw(img)
# Quiet paper/document motif with an emerald identity.
d.rounded_rectangle((190, 140, 834, 884), radius=72, fill="#f7f4ec")
d.polygon([(650, 140), (834, 324), (650, 324)], fill="#cde9df")
for y, width in [(410, 320), (500, 430), (590, 360), (680, 270)]:
    d.rounded_rectangle((280, y, 280 + width, y + 30), radius=15, fill="#154e56")
# Export arrow.
d.rounded_rectangle((584, 720, 760, 760), radius=20, fill="#d97706")
d.polygon([(760, 675), (860, 740), (760, 805)], fill="#d97706")
img.save(root / "icon.png")
img.resize((512, 512), Image.Resampling.LANCZOS).save(root / "splash-icon.png")
img.resize((192, 192), Image.Resampling.LANCZOS).save(root / "favicon.png")
img.resize((432, 432), Image.Resampling.LANCZOS).save(root / "android-icon-foreground.png")
Image.new("RGBA", (432, 432), "#0f766e").save(root / "android-icon-background.png")
img.resize((432, 432), Image.Resampling.LANCZOS).convert("L").save(root / "android-icon-monochrome.png")
