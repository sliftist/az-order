import "./extLoader";
import fs from "fs";

async function* walk(dir: string): AsyncGenerator<string> {
    for await (const d of await fs.promises.opendir(dir)) {
        const entry = `${dir}/${d.name}`;
        if (d.isDirectory()) {
            yield* walk(entry);
        } else if (d.isFile()) {
            yield entry;
        }
    }
}
async function recursiveDelete(dir: string) {
    for await (const d of await fs.promises.opendir(dir)) {
        const entry = `${dir}/${d.name}`;
        if (d.isDirectory()) {
            await recursiveDelete(entry);
        } else if (d.isFile()) {
            await fs.promises.unlink(entry);
        }
    }
    await fs.promises.rmdir(dir);
}


setImmediate(async () => {
    await build();
});


async function build() {
    let time = Date.now();
    let target = "./extension/";
    await fs.promises.mkdir(target, { recursive: true });
    //await recursiveDelete(target);

    let pathsToCopy: string[] = [];
    let curDir = __dirname.replaceAll("\\", "/");
    for (let module of Object.values(require.cache)) {
        if (!module) continue;
        let path = module.filename.replaceAll("\\", "/");
        if (path.includes("/node_modules/typenode/")) continue;
        if (path.includes("/node_modules/typescript/")) continue;
        if (path === __filename.replaceAll("\\", "/")) continue;
        if (path.endsWith(".ts") || path.endsWith(".tsx")) {
            let dir = path.split("/").slice(0, -1).join("/");
            let name = path.split("/").slice(-1)[0];
            let cachePath = `${dir}/dist/${name}.cache`;
            if (fs.existsSync(cachePath)) {
                path = cachePath;
            }
        }
        pathsToCopy.push(path);
    }

    // Recursive read files, and copy all .png and .html files
    for await (let path of walk(curDir)) {
        if (path.includes("/node_modules/")) continue;
        if (path.includes("/.git/")) continue;
        if (path.includes("/extension/")) continue;
        if (path.endsWith(".png") || path.endsWith(".html")) {
            pathsToCopy.push(path);
        }
    }

    for (let path of pathsToCopy) {
        path = path.replace(curDir, "");
        let newPath = target + path;
        newPath = newPath.replaceAll("//", "/");
        // Copy the file, creating parent directories if needed
        let dir = newPath.split("/").slice(0, -1).join("/");
        let fixImports = false;
        if (newPath.endsWith(".cache")) {
            if (dir.endsWith("/dist")) {
                dir = dir.slice(0, -"/dist".length);
                newPath = newPath.replace("/dist/", "/");
            }
            if (newPath.endsWith(".ts.cache")) {
                newPath = newPath.replace(".ts.cache", ".js");
                fixImports = true;
            }
            if (newPath.endsWith(".tsx.cache")) {
                newPath = newPath.replace(".tsx.cache", ".js");
                fixImports = true;
            }
        }
        // preact uses exports, as do probably others. So... just fix imports on everything...
        if (newPath.endsWith(".js")) {
            fixImports = true;
        }
        if (!fs.existsSync(dir)) {
            await fs.promises.mkdir(dir, { recursive: true });
        }
        if (fixImports) {
            let contents = await fs.promises.readFile(curDir + path, "utf8");
            contents = contents.replaceAll(`Object.defineProperty(exports, "__esModule", { value: true , configurable: true});`, "");
            contents = convertExportsToExport(contents);
            contents = convertImports(contents, newPath);
            await fs.promises.writeFile(newPath, contents);
        } else {
            await fs.promises.copyFile(curDir + path, newPath);
        }
    }

    let manifestObj = JSON.parse(await fs.promises.readFile("./manifest.json", "utf8")) as {
        web_accessible_resources: string[];
    };

    await fs.promises.writeFile("./extension/manifest.json", JSON.stringify(manifestObj, null, 4));

    let end = Date.now();
    console.log(`Built in ${end - time}ms at ${new Date().toLocaleTimeString()}`);
}


function convertExportsToExport(code: string): string {
    let hasExports = code.includes("exports.") || code.includes("module.exports");
    if (!hasExports) return code;
    return `
    let exports = {};
    let module = { exports };
    ${code}
    ;
    export default exports;
    `;
}

function convertImports(code: string, path: string): string {
    return code.replace(
        /const (\w+) = __importDefault\(require\("(.+?)"\)\);/g,
        (_, variableName, importPath: string) => {
            return createImport({ variableName, importPath, filePath: path, code, forceDefault: true });
        }
    ).replace(
        /Promise\.resolve\(\)\.then\(\(\) => __importStar\(require\("(.+?)"\)\)\);/g,
        (_, path) => `import("${path}");`
    ).replace(
        // const mobx = __importStar(require("mobx/dist/mobx.cjs.development.js"));
        /const (\w+) = __importStar\(require\("(.+?)"\)\);/g,
        // import * as mobx from "mobx/dist/mobx.cjs.development.js";
        (_, variableName, importPath) => {
            return createImport({ variableName, importPath, filePath: path, code });
        }
    ).replace(
        /const\s+(\w+)\s*=\s*require\(\s*["'](.+)["']\s*\);?\s*/g,
        (_, variableName, importPath) => {
            return createImport({ variableName, importPath, filePath: path, code });
        }
    );
}

function createImport(config: {
    variableName: string;
    importPath: string;
    filePath: string;
    code: string;
    forceDefault?: boolean;
}) {
    let modulePath = config.importPath;
    let variableName = config.variableName;
    let path = config.filePath;
    let code = config.code;
    let forceDefault = config.forceDefault;


    if (!modulePath.startsWith(".")) {

        let fullPath = require.resolve(modulePath);
        let relativePath = fullPath.replace(__dirname, ".");
        modulePath = relativePath.replaceAll("\\", "/");
        let depth = path.split("/").length - 3;
        if (depth > 0) {
            modulePath = "../".repeat(depth) + modulePath;
        }
    }
    if (modulePath.endsWith(".ts") || modulePath.endsWith(".tsx")) {
        modulePath = modulePath.replace(/\.tsx?$/, "");
    }

    let usesDefaultExportsExplicitly = code.includes(`${variableName}.default.`);
    const modulePathWithExtension = modulePath.endsWith(".js") ? modulePath : `${modulePath}.js`;
    if (!usesDefaultExportsExplicitly) {
        return `import ${variableName} from "${modulePathWithExtension}";`;
    } else {
        return `import * as ${variableName} from "${modulePathWithExtension}";`;
    }
}