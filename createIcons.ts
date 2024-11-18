import fs from "fs";
async function main() {
    let faviconSVGFile = await fs.promises.readFile("./icon.svg");

    const { convert } = require("convert-svg-to-png");
    for (let size of [16, 32, 48, 128]) {
        let png = await convert(faviconSVGFile, { width: size, height: size });
        await fs.promises.writeFile(__dirname + `/icon${size}.png`, png);
    }

    // let iconText = faviconSVGFile.toString();
    // async function emitAlt(name: string, dim: number, color: { h: number, s: number, l: number }) {
    //     let primary = `hsl(${color.h}, ${color.s}%, ${color.l}%)`;
    //     let secondary = `hsl(${color.h}, ${color.s}%, ${color.l - 10}%)`;
    //     let tertiary = `hsl(${color.h}, ${color.s}%, ${color.l - 20}%)`;
    //     let icon = iconText.replace(/#4a86e8/g, primary).replace(/#7aa9f5/g, secondary).replace(/#1c4587/g, tertiary);
    //     let png = await convert(Buffer.from(icon), { width: dim, height: dim });
    //     await fs.promises.writeFile(__dirname + `/${name}.png`, png);
    // }

    // await emitAlt("save32", 32, { h: 290, s: 50, l: 50 });
    // await emitAlt("save32Alt", 32, { h: 290, s: 50, l: 80 });
}
main().catch(console.error).finally(() => process.exit());