const puppeteer = require("puppeteer-core");
(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/etc/profiles/per-user/yeehaa/bin/google-chrome-stable",
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    isMobile: true,
  });
  await page.goto(
    "file:///home/yeehaa/Documents/brains/docs/design/rizom-ai.html",
    { waitUntil: "networkidle0", timeout: 10000 },
  );
  await new Promise((r) => setTimeout(r, 2000));
  await page.evaluate(() =>
    document
      .querySelectorAll(".reveal")
      .forEach((el) => el.classList.add("visible")),
  );
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "/tmp/mobile-real.png", fullPage: true });
  console.log("Done");
  await browser.close();
})();
