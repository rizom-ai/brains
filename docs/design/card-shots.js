const p = require("puppeteer-core");
(async () => {
  const b = await p.launch({
    executablePath: "/etc/profiles/per-user/yeehaa/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const pg = await b.newPage();
  await pg.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await pg.goto(
    "file:///home/yeehaa/Documents/brains/docs/design/rizom-ai.html",
    { waitUntil: "networkidle0", timeout: 15000 },
  );
  await new Promise((r) => setTimeout(r, 2500));
  await pg.evaluate(() =>
    document
      .querySelectorAll(".reveal")
      .forEach((el) => el.classList.add("visible")),
  );
  await new Promise((r) => setTimeout(r, 500));
  const boxes = await pg.evaluate(() => {
    const cards = document.querySelectorAll(".product-card");
    return [...cards].map((c) => {
      const r = c.getBoundingClientRect();
      return { y: r.top + window.scrollY, h: r.height };
    });
  });
  const names = ["rover", "relay", "ranger"];
  for (let i = 0; i < Math.min(3, boxes.length); i++) {
    const box = boxes[i];
    await pg.screenshot({
      path: "/tmp/card-" + names[i] + ".png",
      clip: { x: 0, y: box.y, width: 1440, height: box.h + 20 },
    });
    console.log("wrote card-" + names[i] + ".png at y=" + box.y);
  }
  await b.close();
})();
