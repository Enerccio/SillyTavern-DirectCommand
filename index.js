import {event_types, eventSource} from "../../../events.js";
import {getChatMetadata, getData, getMessageDiv, setChatMetadata, setData} from "./utils.js";
import {MODULE_NAME, EXTENSION_PATH} from "./conf.js";
import {renderExtensionTemplateAsync} from "../../../extensions.js";

class DirectCommand {

    constructor(prefix, postfix) {
        this.prefix = prefix || "";
        this.postfix = postfix || "";
    }

    static fromJson(json) {
        return new DirectCommand(json.prefix, json.postfix);
    }

    toJson() {
        return {
            prefix: this.prefix,
            postfix: this.postfix
        };
    }

    applyTo(message) {
        if (message) {
            if (!message.content) {
                message.content = "";
            }
            if (this.prefix) {
                message.content = `[${this.prefix}]\n` + message.content;
            }
            if (this.postfix) {
                message.content += `\n[${this.postfix}]\n`;
            }
        }
    }

}

class DirectCommandManager {

    static COMMAND = 'command';
    static PROMPT_COMMAND = 'prompt_command';
    static PROMPT_COMMAND_APPEND = 'prompt_command_append';

    constructor() {
        this.currentPrompt = new DirectCommand();
        this.appendCurrentPrompt = false;

        this.$chat = $("#chat");
        this.$leftButtons = $("#leftSendForm");
        this.$sendButton = $("#send_but");
        this.$openButton = null;
    }

    async wire() {
        this.$openButton = $(`<div id="${MODULE_NAME}_editCurrentPrompt" style="display: flex;" class="fa-solid fa-robot interactable" title="Direct Command" data-i18n="[title]Direct Command" tabindex="0"></div>`);
        // TODO: Append this.$openButton to $leftButtons and add wiring to it - call this._editCurrentPrompt

        // TODO: add logic to $sendButton, if it has fa-paper-plane and interactable as styles, bind this._saveCurrentPrompt
    }

    async processUserMessage(index) {
        const context = SillyTavern.getContext();
        const message = context.chat[index];
        if (this.appendCurrentPrompt && index === context.chat.length - 1) {
            // new submitted message, bind prompt to it if it was edited
            if (this.appendCurrentPrompt) {

                this.appendCurrentPrompt = false;
                this.currentPrompt = new DirectCommand();
            }
        } else {
            if (message && message.is_user) {
                const command = this._getDirectCommand(message);
                const messageDiv = getMessageDiv(index);
                if (messageDiv) {
                    const $characterName = messageDiv.find('ch_name > :first_child > :first_child');
                    if ($characterName) {
                        if (command) {
                            // TODO: Append button to edit fa-solid fa-robot button to $characterName and wire click logic to this._editPrompt with that button
                        } else {
                            // TODO: Check and remove button to edit
                        }
                    }
                }
            }
        }
    }

    onChatRefresh() {
        const currentPrompt = getChatMetadata(DirectCommandManager.PROMPT_COMMAND, true);
        if (currentPrompt) {
            this.currentPrompt = DirectCommand.fromJson(currentPrompt);
        } else {
            this.currentPrompt = new DirectCommand();
        }
        this.appendCurrentPrompt = getChatMetadata(DirectCommandManager.PROMPT_COMMAND_APPEND, false);
    }

    processPrompt(data) {
        const context = SillyTavern.getContext();
        for (let i = data.chat.length - 1; i >= 0; i--) {
            if (data.chat[i].role === 'user') {
                if (context.chat[i]) {
                    const prompt = this._getDirectCommand(context.chat[i]);
                    if (prompt) {
                        prompt.applyTo(context.chat[i]);
                    }
                    return;
                }
            }
        }
    }

    async _editCurrentPrompt() {
        const $template = await this._loadTemplate();
        // TODO: Bind template fields to this.currentPrompt
        // TODO: Bind template save button to this._saveCurrentPrompt

        // TODO: Display template to the top of the this.$openButton, higher zindex, width should be calculated based
        //  on position of start of <this.$openButton left offset from start of webpage>
        //  width should be (this.$chat width - (<this.$openButton left offset from start of webpage> - <this.$chat left offset from start of webpage>)
    }

    async _editPrompt($button, prompt) {
        const $template = await this._loadTemplate();
        // TODO: Bind template fields to prompt
        // TODO: Bind template save button to this._savePrompt
        // TODO: Display template to the bottom of the $button, higher zindex, width should be calculated based
        //  on position of start of <$button left offset from start of webpage>
        //  width should be (this.$chat width - (<$button left offset from start of webpage> - <this.$chat left offset from start of webpage>)
    }

    _saveCurrentPrompt(pre, post) {
        this.appendCurrentPrompt = true;
        this.currentPrompt.prefix = pre;
        this.currentPrompt.postfix = post;
        this._save(this.currentPrompt);
        setChatMetadata(DirectCommandManager.PROMPT_COMMAND_APPEND, this.appendCurrentPrompt, false);
    }

    _savePrompt(index, prompt) {
        this._save(prompt, index);
    }

    _save(command, index = undefined) {
        if (command) {
            if (index) {
                const context = SillyTavern.getContext();
                const message = context.chat[index];
                if (message) {
                    this._setDirectCommand(command, message);
                }
            } else {
                setChatMetadata(DirectCommandManager.PROMPT_COMMAND, command.toJson(), true);
            }
        }
    }

    _getDirectCommand(message) {
        const data = getData(message, DirectCommandManager.COMMAND);
        if (data) {
            return DirectCommand.fromJson(data);
        }
        return null;
    }

    _setDirectCommand(message, command) {
        if (command && message) {
            setData(message, DirectCommandManager.COMMAND, command.toJson());
        }
    }

    async _loadTemplate() {
        return $(await renderExtensionTemplateAsync(EXTENSION_PATH, 'directcommand'))
    }
}

let manager = null;

$(async function () {
    manager = new DirectCommandManager();
    await manager.wire();

    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (data) => {
        manager.processPrompt(data);
    });
    eventSource.on(event_types.USER_MESSAGE_RENDERED, async (messageId) => {
        await manager.processUserMessage(messageId);
    });
    for (let event of [event_types.CHAT_LOADED, event_types.CHAT_CHANGED]) {
        manager.onChatRefresh();
    }
});
