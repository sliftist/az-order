import child_process from "child_process";
import admZip from "adm-zip";

async function main() {
    child_process.execSync("yarn build", { stdio: "inherit" });
    const zip = new admZip();
    zip.addLocalFolder("extension");
    zip.writeZip("extension.zip");
}


main().catch(console.error).finally(() => process.exit(0));