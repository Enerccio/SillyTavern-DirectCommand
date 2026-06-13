import {EXTENSION_NAME} from "./conf.js";
import {MODULE_NAME} from "/scripts/extensions/third-party/SillyTavern-StickyNote/conf.js";
import {chat_metadata, saveChatDebounced} from "/script.js";
import {saveMetadataDebounced} from "/scripts/extensions.js";

export function log() {
    console.log(`[${EXTENSION_NAME}]`, ...arguments);
}

export function error() {
    console.error(`[${EXTENSION_NAME}]`, ...arguments);
    toastr.error(Array.from(arguments).join(' '), EXTENSION_NAME);
}

export function toast(message, type="info") {
    toastr[type](message, EXTENSION_NAME);
}

export function getMessageDiv(index) {
    // given a message index, get the div element for that message
    // it will have an attribute "mesid" that is the message index
    // noinspection JSUnresolvedReference
    let div = $(`div[mesid="${index}"]`);
    if (div.length === 0) {
        return null;
    }
    return div;
}

export function getData(message, key) {
    // get information from the message object
    return message?.extra?.[MODULE_NAME]?.[key];
}

export function setData(message, key, value) {
    // store information on the message object
    if (!message.extra) {
        message.extra = {};
    }
    if (!message.extra[MODULE_NAME]) {
        message.extra[MODULE_NAME] = {};
    }

    message.extra[MODULE_NAME][key] = value;

    // Also save on the current swipe info if present
    let swipe_index = message.swipe_id
    if (swipe_index && message.swipe_info?.[swipe_index]) {
        if (!message.swipe_info[swipe_index].extra) {
            message.swipe_info[swipe_index].extra = {};
        }
        message.swipe_info[swipe_index].extra[MODULE_NAME] = structuredClone(message.extra[MODULE_NAME])
    }

    saveChatDebounced();
}


export function getChatMetadata(key, copy=false) {
    // Get a key from chat metadata
    let value = chat_metadata[MODULE_NAME]?.[key]
    if (copy) {  // needed when retrieving objects
        return structuredClone(value)
    } else {
        return value
    }
}

export function setChatMetadata(key, value, copy=false) {
    // Set a key and value in chat metadata (persists with branches)
    if (copy) {
        value = structuredClone(value);
    }
    if (!chat_metadata[MODULE_NAME]) chat_metadata[MODULE_NAME] = {};
    chat_metadata[MODULE_NAME][key] = value;
    saveMetadataDebounced();
}
