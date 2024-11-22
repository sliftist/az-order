import { sort } from "socket-function/src/misc";

let itemByOrderNumber = new Map<string, string>();
let anchor: HTMLElement | undefined;

export async function addMorePages() {
    let betterStyles = `
        .js-yo-main-content {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            width: unset;
            padding: 20px;
            align-items: start;
        }
        .your-orders-content-container {
            width: unset !important;
        }
        .order-card.js-order-card {
            max-width: 650px;
        }
        .order-card.js-order-card > .a-spacing-base {
            margin-bottom: 0px !important;
        }
        .order-card.js-order-card .order-header, .order-card.js-order-card .order-footer {
            border-radius: 0px;
        }
        .right-rail.js-yo-right-rail {
            display: none !important;
        }

        .status-not-delivered {
            box-shadow: 0 0 5px 3px hsl(47, 75%, 60%);
        }
        .status-delivered-today {
            box-shadow: 0 0 6px 2px hsl(120, 60%, 60%);
        }
    `;
    let style = document.createElement("style");
    style.textContent = betterStyles;
    document.head.appendChild(style);

    // Disable CSD, otherwise the orders are too difficult to parse
    document.cookie = "csd-key=disabled; path=/; secure; SameSite=Strict";

    let firstOrderCard = document.querySelector(".order-card.js-order-card");
    anchor = firstOrderCard?.previousSibling as any;
    if (!anchor) return;

    let periodsToCheck = [];
    // Also include the next year, current, and last 10
    let curYear = new Date().getFullYear();
    for (let i = -1; i <= 10; i++) {
        periodsToCheck.push(`year-${curYear - i}`);
    }

    loadNewPage(document.body.innerHTML);

    let pagesToLoad = 10;
    for (let period of periodsToCheck) {
        let index = 0;
        while (true) {
            console.log(`Loading ${period} page ${index}`);
            let html = await getHTML(period, index++);
            if (!html) break;
            if (!loadNewPage(html)) break;
            pagesToLoad--;
            if (pagesToLoad <= 0) break;
        }
        if (pagesToLoad <= 0) break;
    }
}

function loadNewPage(html: string) {
    try {
        let dom = new DOMParser().parseFromString(html, "text/html");
        let items = Array.from(dom.querySelectorAll(".order-card.js-order-card"));
        if (!items.length) return false;
        let itemsRaw = items.map(item => item.outerHTML);
        let newCount = 0;
        for (let item of itemsRaw) {
            let orderNumber = getOrderNumber(item);
            if (!orderNumber) continue;
            if (!itemByOrderNumber.has(orderNumber)) newCount++;
            itemByOrderNumber.set(orderNumber, item);
        }
        console.log(`Loaded ${newCount} new items, have ${itemByOrderNumber.size} total`);
        rerenderItems();
        return true;
    } catch (e) {
        console.error(e);
        return { items: [], pageCount: 0 };
    }
}

function rerenderItems() {
    if (!anchor) return;

    let allItems = Array.from(itemByOrderNumber.values()).flatMap(splitItemIntoShipments);
    sort(allItems, x => -getDeliveryDate(x));
    sort(allItems, x => wasDelivered(x) ? 1 : 0);

    let flatIds = allItems.map(getOrderNumber);
    let newIds = new Set(flatIds);
    let existingOrderCards = Array.from(document.querySelectorAll(".order-card.js-order-card"));
    for (let card of existingOrderCards) {
        let id = getOrderNumber(card.outerHTML);
        if (!newIds.has(id)) {
            card.remove();
        } else {
            newIds.delete(id);
        }
    }


    let curAnchor = Array.from(document.querySelectorAll(".order-card.js-order-card")).at(-1) || anchor;

    // Append new items
    for (let item of allItems) {
        if (!newIds.has(getOrderNumber(item))) continue;
        let div = document.createElement("div");
        div.innerHTML = item;
        div = div.children[0] as any;
        curAnchor.after(div);
        curAnchor = div;
    }

    // Set flags
    for (let card of document.querySelectorAll(".order-card.js-order-card")) {
        let item = card.outerHTML;
        if (!wasDelivered(item)) {
            let shipmentNode = card.querySelector(".delivery-box .a-row") || card.querySelector(".a-box.shipment .a-row .a-row");
            if (shipmentNode && !shipmentNode.querySelector("#delivery-time")) {
                shipmentNode.setAttribute("style", "display: flex; align-items: center; ");
                let deliveryTime = getDeliveryDate(item);
                let daysExact = (deliveryTime - Date.now()) / (1000 * 60 * 60 * 24);
                let newUI = document.createElement("span");
                newUI.id = "delivery-time";
                newUI.className = "a-size-mini";
                newUI.textContent = `(${daysExact.toFixed(1)} days)`;
                newUI.title = new Date(deliveryTime).toLocaleString();
                newUI.setAttribute("style", "margin-left: 10px;");
                shipmentNode.appendChild(newUI);
            }
            card.classList.add("status-not-delivered");
        } else {
            let deliveryDate = getDeliveryDate(item);
            // If it was within a day, status-delivered-today
            if (Math.abs(deliveryDate - Date.now()) < 1000 * 60 * 60 * 24) {
                card.classList.add("status-delivered-today");
            }
        }
    }

    // Reorder orders
    {
        let idToIndex = new Map(flatIds.map((id, index) => [id, index]));

        let orderElements = Array.from(document.querySelectorAll(".order-card.js-order-card"));
        if (orderElements.length === 0) return;
        let elements = orderElements.map(x => [getOrderNumber(x.outerHTML) || "", x] as const);

        let referenceOrder: (readonly [string, Element])[] = [];
        referenceOrder.push(elements.shift()!);

        let unordered: (readonly [string, Element])[] = [];
        while (true) {
            let next = elements.shift();
            if (!next) break;
            let prevIndex = idToIndex.get(referenceOrder.at(-1)![0])!;
            let newIndex = idToIndex.get(next[0])!;
            if (newIndex < prevIndex) {
                console.log(`Fix sort order for item: ${next[0]}, ${newIndex} < ${prevIndex}`);
                unordered.push(next);
            } else {
                referenceOrder.push(next);
            }
        }

        // Remaining element are not in order
        while (unordered) {
            let next = unordered.shift();
            if (!next) break;
            let ourIndex = idToIndex.get(next[0])!;
            let minDist = Infinity;
            let bestIndex = -1;
            for (let i = 0; i < referenceOrder.length; i++) {
                let dist = Math.abs(idToIndex.get(referenceOrder[i][0])! - ourIndex);
                if (dist < minDist) {
                    minDist = dist;
                    bestIndex = i;
                }
            }
            let refObj = referenceOrder[bestIndex];
            let refIndex = idToIndex.get(refObj[0])!;
            if (refIndex < ourIndex) {
                bestIndex++;
                refObj[1].after(next[1]);
            } else {
                refObj[1].before(next[1]);
            }
            referenceOrder.splice(bestIndex, 0, next);
        }
    }
}

async function getHTML(period: string, index: number): Promise<string | undefined> {
    let html = await fetch(`/your-orders/orders?timeFilter=${period}&startIndex=${index * 10}&ref_=amazing-re-order-extension&disableCsd`).then(res => res.text());

    let dom = new DOMParser().parseFromString(html, "text/html");

    let selectedPeriod = dom.querySelector("select[name='timeFilter'] > option[selected]");
    if (!selectedPeriod || (selectedPeriod as any).value !== period) {
        return undefined;
    }
    return html;
}

function splitItemIntoShipments(item: string): string[] {
    const PLACEHOLDER = "PLACEHOLDER-274e7d79-a21b-4689-8dd1-53957efd2f60";
    const ORDER_PLACEHOLDER = "ORDER_PLACEHOLDER-a2a5aa82-7489-4c60-b980-2e3db954d28b";
    let dom = new DOMParser().parseFromString(item, "text/html");
    let boxHolder = dom.querySelector(".a-box-group");
    let shipments: string[] = [];
    let orderHolder = boxHolder?.querySelector(".yohtmlc-order-id");
    if (orderHolder && orderHolder.children.length >= 2) {
        orderHolder.children[1].innerHTML += ` ${ORDER_PLACEHOLDER}`;
    }
    for (let child of Array.from(boxHolder?.children || [])) {
        if (child.classList.contains("delivery-box") || child.classList.contains("shipment")) {
            getOrderNumber(child.outerHTML);
            shipments.push(child.outerHTML);
            if (shipments.length === 1) {
                // Add a placeholder for the first shipment
                child.replaceWith(document.createTextNode(PLACEHOLDER));
            } else {
                child.remove();
            }
        }
    }

    let structureHTML = dom.body.innerHTML;
    return shipments.map((shipment, index) =>
        structureHTML
            .replace(PLACEHOLDER, shipment)
            .replaceAll(ORDER_PLACEHOLDER, shipments.length > 1 ? ` #${index + 1}/${shipments.length}` : "")
    );
}

function isFullDate(text: string): boolean {
    let parts = text.toLowerCase().replaceAll(/^a-z /g, "").split(" ");
    // If it has a year, just part it directly
    return parts.some(x => +x > 2000);
}

function getOrderNumber(itemHTML: string): string | undefined {
    let dom = new DOMParser().parseFromString(itemHTML, "text/html");
    let holder = dom.querySelector(".yohtmlc-order-id");
    if (!holder) return undefined;
    return holder.children[1].textContent?.trim();
    // let index = itemHTML.indexOf("yohtmlc-order-id");
    // index = itemHTML.indexOf("<span", index) + 1;
    // index = itemHTML.indexOf("<span", index);
    // index = itemHTML.indexOf(">", index);
    // let startIndex = index + 1;
    // let endIndex = itemHTML.indexOf("</", startIndex);
    // let orderId = itemHTML.slice(startIndex, endIndex).trim();
    // orderId = orderId.split(">").at(-1) || "";
    // if (orderId.length < 5 || orderId.length > 30) return undefined;
    // return orderId;
}
function parseOrderPlacedText(itemHTML: string): string | undefined {
    let dom = new DOMParser().parseFromString(itemHTML, "text/html");
    return (
        dom.querySelector(".a-row.a-size-mini")?.nextElementSibling?.textContent?.trim()
        || undefined
    );
}
function getDeliveryText(itemHTML: string) {
    let dom = new DOMParser().parseFromString(itemHTML, "text/html");
    let text = dom.querySelector(".delivery-box .a-row")?.textContent ?? dom.querySelector(".a-box.shipment .a-row .a-row")?.textContent;
    text = text?.trim();

    if (!text) {
        text = parseOrderPlacedText(itemHTML)?.trim();
    }

    return text;
}
function getDeliveryDate(itemHTML: string): number {
    let shipment = splitItemIntoShipments(itemHTML);
    return Math.max(...shipment.map(getDeliveryDateBase));
}
function getDeliveryDateBase(itemHTML: string): number {
    let text = getDeliveryText(itemHTML) || "";
    let range = parseDeliveryTime(text);
    if (!isFullDate(text)) {
        // If it is over 6 months, we probably wrapped around, and should just use the order time
        let timeToDeliver = Date.now() - range.start.getTime();
        let timeInMonth = 1000 * 60 * 60 * 24 * 30;
        if (
            // Instead of being delivered over 3 months ago, it is probably going to be
            //      delivered in the next year
            timeToDeliver < -timeInMonth * 3
            // If it is over 9 months, it is likely actually delivered in the previous year
            || timeToDeliver > timeInMonth * 9
        ) {
            text = parseOrderPlacedText(itemHTML) || "";
            if (text) {
                range = parseDeliveryTime(text);
            }
        }
    }
    if (Number.isNaN(range.start.getTime())) {
        text = parseOrderPlacedText(itemHTML) || "";
        if (text) {
            range = parseDeliveryTime(text);
        }
    }

    return (range.end || range.start).getTime();
}
function wasDelivered(itemHTML: string): boolean {
    let text = getDeliveryText(itemHTML);
    if (!text) return true;
    return !["expected", "arriving"].some(x => text.toLowerCase().includes(x));
}


// Arriving Tuesday
// Arriving tomorrow by 10 PM
// Delivered today
// Delivered 13 November
// Arriving 15 November - 19 November
interface DateRange {
    start: Date;
    end?: Date;
}

function parseDeliveryTime(input: string): DateRange {
    input = input.trim().toLowerCase();

    // Split "* 12 PM - 3 PM" into "* 12 PM" and "* 3 PM"
    if (input.includes(" - ")) {
        let prefix = input.slice(0, input.indexOf(" - "));
        prefix = prefix.split(" ").slice(0, -2).join(" ");
        let firstPart = input.split(" - ")[0];
        let secondPart = prefix + " " + input.split(" - ")[1];
        return {
            start: parseDeliveryTime(firstPart).start,
            end: parseDeliveryTime(secondPart).start
        };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Helper function to parse date string
    // Take the last part of any range
    let dateStr = input;
    dateStr = dateStr.split(" - ").at(-1)!.trim();
    // Replace "12 pm" with "12:00:00", etc
    dateStr = dateStr.replace("12 pm", "12:00:00").replace("12 am", "00:00:00");
    for (let i = 1; i <= 11; i++) {
        dateStr = dateStr.replace(`${i} pm`, `${i + 12}:00:00`).replace(` ${i} am`, ` ${i}:00:00`);
    }
    dateStr = dateStr.split(" ").filter(x => !["now", "arriving", "today", "expected", "by", "was", "delivered"].includes(x)).join(" ");

    let date = new Date();

    const daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    // Remove day, and add offset later
    for (let dayOfWeek of daysOfWeek) {
        if (!dateStr.includes(dayOfWeek)) continue;
        // Always assume it's the future
        let dayOffset = (daysOfWeek.indexOf(dayOfWeek) - today.getDay() + 7) % 7;
        date = new Date(date.getTime() + dayOffset * 1000 * 60 * 60 * 24);
        dateStr = dateStr.replace(dayOfWeek, "");
    }
    if (dateStr.includes("tomorrow")) {
        // Apparently, at 12 am, amazon doesn't count it as being tomorrow. Maybe?
        date = new Date(date.getTime() + 1000 * 60 * 60 * 22);
        dateStr = dateStr.replace("tomorrow", "");
    }

    function isYear(str: string) {
        return str.length === 4 && !Number.isNaN(+str);
    }
    function isMonth(str: string) {
        return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].some(x => str.includes(x));
    }
    function isHour(str: string) {
        return str.includes(":00");
    }
    function isDay(str: string) {
        return str.length > 0 && str.length <= 2 && !Number.isNaN(+str);
    }

    // Default to 5PM IF it is not delivered
    if (!input.includes("delivered") && !(input.includes("pm") || input.includes("am"))) {
        date.setHours(17, 0, 0, 0);
    } else {
        // Otherwise, midnight
        date.setHours(0, 0, 0, 0);
    }
    for (let part of dateStr.split(" ")) {
        part = part.trim();
        if (part.endsWith(",")) {
            part = part.slice(0, -1);
        }
        if (isYear(part)) {
            date.setFullYear(+part);
        }
        if (isMonth(part)) {
            let mon = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].findIndex(x => part.includes(x));
            date.setMonth(mon);
        }
        if (isDay(part)) {
            date.setDate(+part);
        }
        if (isHour(part)) {
            let [hour, minute, second] = part.split(":").map(x => +x);
            date.setHours(hour, minute, second);
        }
    }

    return {
        start: date
    };
}