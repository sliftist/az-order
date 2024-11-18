export function isInChromeExtension() {
    return typeof chrome !== "undefined";
}
export function isInBrowser() {
    return typeof document !== "undefined";
}
export function isInBuild() {
    return !isInBrowser() && !isInChromeExtension();
}

export function isInServiceWorker() {
    return isInChromeExtension() && !isInBrowser();
}

export function isInNewTabPage() {
    return isInChromeExtension() && isInBrowser();
}