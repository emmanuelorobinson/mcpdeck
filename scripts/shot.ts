import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const routes = process.argv.slice(2);
if (!routes.length) {
  routes.push("/=overview", "/servers=servers", "/harnesses=harnesses");
}

mkdirSync(".shots", { recursive: true });

const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
});

const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});

page.on("console", (message) => {
  if (message.type() === "error") {
    console.log(`[console] ${message.text()}`);
  }
});
page.on("pageerror", (error) => console.log(`[pageerror] ${error.message}`));

for (const entry of routes) {
  const [route, name] = entry.split("=");
  await page.goto(`http://localhost:3100${route}`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: `.shots/${name}.png`,
    fullPage: false,
  });
  console.log(`captured ${route} -> .shots/${name}.png`);
}

await browser.close();
