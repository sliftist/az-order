function isInChromeExtension() {
    return typeof chrome !== "undefined";
}
function isInBrowser() {
    return typeof document !== "undefined";
}
function isInBuild() {
    return !isInBrowser() && !isInChromeExtension();
}


if (isInBrowser()) {
    window.process = {
        env: {
        }
    } as any;
}
if (isInChromeExtension()) {
    import("./extMain.js");
} else {
    import("./extMain");
}