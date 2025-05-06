const puppeteer = require('puppeteer');

module.exports = {
    command: 'emojipedia',
    description: "Look up what an emoji looks like on all platforms (warning: spammy).",
    argsRequired: 1,
    usage: '<emoji>',
    example: {
        run: "emojipedia 🤔",
        result: "Returns thinking emoji on all platforms."
    },
    call: async (obj) => {
        const { argv, msg } = obj;
        const emoji = argv.slice(1).join('').trim();

        if (!emoji) return Promise.reject("Please provide an emoji to look up.");

        try {
            const browser = await puppeteer.launch({ headless: 'new' });
            const page = await browser.newPage();

            const encodedEmoji = encodeURIComponent(emoji);
            const url = `https://emojipedia.org/${encodedEmoji}/#designs`;

            await page.goto(url, { waitUntil: 'domcontentloaded' });

            // Scroll to the bottom to trigger lazy loading
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            await new Promise(resolve => setTimeout(resolve, 3000));

            const results = await page.evaluate(() => {
                const pins = Array.from(document.querySelectorAll("section"))
                    .flatMap(section => Array.from(section.querySelectorAll("a > img")))
                    .map(img => {
                        const pinContainer = img.closest("a")?.closest("div")?.parentElement;
                        const dateElem = pinContainer?.querySelector("time");
                        const versionElem = pinContainer?.querySelector("strong");

                        return {
                            img: img.src,
                            date: dateElem?.innerText.trim() || "Unknown Date",
                            version: versionElem?.innerText.trim() || "Unknown Version"
                        };
                    });

                return pins.filter(e => e.img);
            });

            await browser.close();

            if (!results.length) return Promise.reject("Couldn't find emoji designs.");

            for (const result of results) {
                await msg.channel.send({
                    embeds: [{
                        title: `Emoji Design: ${emoji}`,
                        description: `Version: ${result.version}\nDate: ${result.date}`,
                        thumbnail: { url: result.img },
                        url
                    }]
                });
            }

            return Promise.resolve();
        } catch (err) {
            console.error(err);
            return Promise.reject("Error fetching emoji data.");
        }
    }
};