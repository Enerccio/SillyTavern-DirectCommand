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
            if (this.prefix && !message.content.startsWith(`${this.prefix}\n`)) {
                message.content = `${this.prefix}\n` + message.content;
            }
            if (this.postfix && !message.content.endsWith(`\n${this.postfix}\n`)) {
                message.content = message.content + `\n${this.postfix}\n`;
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
        this.$sendButton = $("#send_but");
        this.$openButton = null;
    }

    async wire() {
        if ($(`#${MODULE_NAME}_editCurrentPrompt`).length > 0) return;

        this._updateButtonState();

        this.$openButton = $(`<div id="${MODULE_NAME}_editCurrentPrompt" style="display: flex;" class="fa-solid fa-robot interactable ${MODULE_NAME}_button_container" title="Direct Command" data-i18n="[title]Direct Command" tabindex="0"></div>`);
        this.$openButton.insertAfter('#extensionsMenuButton');
        this.$openButton.on('click', () => {
            this._editCurrentPrompt();
        });

        this.$sendButton.on('click', () => {
            if (this.$sendButton.hasClass('fa-paper-plane') && this.$sendButton.hasClass('interactable')) {
                const $popup = $(`.${MODULE_NAME}_global_popup`);
                if ($popup.length) {
                    const pre = $popup.find(`.${MODULE_NAME}_prepend`).val();
                    const post = $popup.find(`.${MODULE_NAME}_append`).val();
                    this._saveCurrentPrompt(pre, post);
                    $popup.remove();
                }
            }
        });
    }

    async storeDirectCommand(index) {
        const context = SillyTavern.getContext();
        const message = context.chat[index];

        const $popup = $(`.${MODULE_NAME}_global_popup`);
        if ($popup.length) {
            const pre = $popup.find(`.${MODULE_NAME}_prepend`).val();
            const post = $popup.find(`.${MODULE_NAME}_append`).val();
            this.currentPrompt.prefix = pre;
            this.currentPrompt.postfix = post;
            this.appendCurrentPrompt = true;
            this._updateButtonState();
            $popup.remove();
            if (this.$openButton) {
                this.$openButton.data('popup', null);
            }
        }

        if (this.appendCurrentPrompt && index === context.chat.length - 1) {
            // new submitted message, bind prompt to it if it was edited
            this._setDirectCommand(message, this.currentPrompt);
            this.appendCurrentPrompt = false;
            this.currentPrompt = new DirectCommand();
            this._updateButtonState();
            setChatMetadata(DirectCommandManager.PROMPT_COMMAND_APPEND, this.appendCurrentPrompt, false);
            setChatMetadata(DirectCommandManager.PROMPT_COMMAND, this.currentPrompt.toJson(), true);
            await this.processUserMessage(index);
        }
    }

    async processUserMessage(index) {
        const context = SillyTavern.getContext();
        const message = context.chat[index];

        if (message && message.is_user) {
            const command = this._getDirectCommand(message);
            const messageDiv = getMessageDiv(index);
            if (messageDiv) {
                let $characterName = messageDiv.find('.ch_name > :first-child > :first-child').first();
                if ($characterName.length === 0) {
                    $characterName = messageDiv.find('.ch_name').first();
                }
                if ($characterName.length > 0) {
                    const editBtnClass = `${MODULE_NAME}_edit_btn`;
                    let $editBtn = $characterName.find(`.${editBtnClass}`);
                    if (command) {
                        if ($editBtn.length === 0) {
                            $editBtn = $(`<span class="${editBtnClass} fa-solid fa-robot interactable" style="margin-left: 8px; cursor: pointer;" title="Edit Direct Command"></span>`);
                            $characterName.append($editBtn);
                            $editBtn.on('click', (e) => {
                                e.stopPropagation();
                                this._editPrompt($editBtn, command);
                            });
                        }
                    } else {
                        $editBtn.remove();
                    }
                }
            }
        }
    }

    async onChatRefresh() {
        $(`.${MODULE_NAME}_container`).remove();
        $(`.${MODULE_NAME}_confirm_container`).remove();

        const currentPrompt = getChatMetadata(DirectCommandManager.PROMPT_COMMAND, true);
        if (currentPrompt) {
            this.currentPrompt = DirectCommand.fromJson(currentPrompt);
        } else {
            this.currentPrompt = new DirectCommand();
        }
        this.appendCurrentPrompt = getChatMetadata(DirectCommandManager.PROMPT_COMMAND_APPEND, false);

        this._updateButtonState();

        const context = SillyTavern.getContext();
        for (let i = 0; i < context.chat.length; i++) {
            await manager.processUserMessage(i);
        }
    }

    processPrompt(data) {
        const context = SillyTavern.getContext();
        if (!context.chat || context.chat.length === 0) return;

        // 1. Find the latest core message (user or assistant) in the outgoing prompt payload
        let lastCoreDataMessage = null;
        for (let i = data.chat.length - 1; i >= 0; i--) {
            const role = data.chat[i]?.role;
            // Explicitly ignore 'tool' and 'system' payload layers
            if (role === 'user' || role === 'assistant') {
                lastCoreDataMessage = data.chat[i];
                break;
            }
        }

        // If the last core turn isn't a user message, it's a continuation or multi-bot response. Skip it.
        if (!lastCoreDataMessage || lastCoreDataMessage.role !== 'user') return;

        // 2. Find the core conversation messages at the tail end of full chat history
        // We skip system messages and tool entries to get a clean user/assistant timeline.
        let coreContextMessages = [];
        for (let j = context.chat.length - 1; j >= 0; j--) {
            const m = context.chat[j];
            if (!m) continue;

            const isSystem = m.is_system === true;
            const isTool = m.extra?.role === 'tool' || m.extra?.is_tool === true || m.extra?.type === 'tool';

            if (!isSystem && !isTool) {
                coreContextMessages.push(m);
                // We only need the last two core messages to evaluate Normal Send vs Swipe
                if (coreContextMessages.length >= 2) break;
            }
        }

        if (coreContextMessages.length === 0) return;

        let targetUserMessage = null;
        const latestContextMessage = coreContextMessages[0];

        if (latestContextMessage.is_user === true) {
            // Case A: Normal Send. The user message is at the active edge of the conversation.
            targetUserMessage = latestContextMessage;
        } else {
            // Case B: Swipe. The core timeline ends with the AI turn being regenerated.
            // The user message that triggered it sits directly behind it.
            if (coreContextMessages.length >= 2) {
                const penultimateContextMessage = coreContextMessages[1];
                if (penultimateContextMessage && penultimateContextMessage.is_user === true) {
                    targetUserMessage = penultimateContextMessage;
                }
            }
        }

        // 3. Inject the command strictly into the current outgoing user turn payload
        if (targetUserMessage) {
            const prompt = this._getDirectCommand(targetUserMessage);
            if (prompt) {
                prompt.applyTo(lastCoreDataMessage);
            }
        }
    }

    async _editCurrentPrompt() {
        const existingPopup = this.$openButton.data('popup');
        if (existingPopup && existingPopup.parent().length) {
            if (this._hasChanges(existingPopup, this.currentPrompt)) {
                this._showConfirmPopup((action) => {
                    if (action === 'save') {
                        const pre = existingPopup.find(`.${MODULE_NAME}_prepend`).val();
                        const post = existingPopup.find(`.${MODULE_NAME}_append`).val();
                        this._saveCurrentPrompt(pre, post);
                        existingPopup.remove();
                        this.$openButton.data('popup', null);
                    } else if (action === 'discard') {
                        existingPopup.remove();
                        this.$openButton.data('popup', null);
                    }
                });
            } else {
                existingPopup.remove();
                this.$openButton.data('popup', null);
            }
            return;
        }

        $(`.${MODULE_NAME}_global_popup`).remove();

        const $template = await this._loadTemplate();
        $template.addClass(`${MODULE_NAME}_global_popup`);

        const prefixArea = $template.find(`.${MODULE_NAME}_prepend`);
        const postfixArea = $template.find(`.${MODULE_NAME}_append`);
        prefixArea.val(this.currentPrompt.prefix || "");
        postfixArea.val(this.currentPrompt.postfix || "");

        $template.find(`.${MODULE_NAME}_save`).on('click', () => {
            const pre = prefixArea.val();
            const post = postfixArea.val();
            this._saveCurrentPrompt(pre, post);
            $template.remove();
            this.$openButton.data('popup', null);
        });

        $template.find(`.${MODULE_NAME}_close`).on('click', () => {
            if (this._hasChanges($template, this.currentPrompt)) {
                this._showConfirmPopup((action) => {
                    if (action === 'save') {
                        const pre = $template.find(`.${MODULE_NAME}_prepend`).val();
                        const post = $template.find(`.${MODULE_NAME}_append`).val();
                        this._saveCurrentPrompt(pre, post);
                        $template.remove();
                        this.$openButton.data('popup', null);
                    } else if (action === 'discard') {
                        $template.remove();
                        this.$openButton.data('popup', null);
                    }
                });
            } else {
                $template.remove();
                this.$openButton.data('popup', null);
            }
        });

        const chatLeft = this.$chat.offset().left;
        const openLeft = this.$openButton.offset().left;
        const chatWidth = this.$chat.outerWidth();
        const width = chatWidth - (openLeft - chatLeft);
        const bottom = $(window).height() - this.$openButton.offset().top;

        $template.css({
            position: 'fixed',
            left: `${openLeft}px`,
            bottom: `${bottom}px`,
            width: `${width}px`,
            zIndex: 10000
        });

        this.$openButton.data('popup', $template);
        $('body').append($template);
    }

    async _editPrompt($button, prompt) {
        const existingPopup = $button.data('popup');
        if (existingPopup && existingPopup.parent().length) {
            if (this._hasChanges(existingPopup, prompt)) {
                this._showConfirmPopup((action) => {
                    if (action === 'save') {
                        const index = parseInt($button.closest('[mesid]').attr('mesid'));
                        prompt.prefix = existingPopup.find(`.${MODULE_NAME}_prepend`).val();
                        prompt.postfix = existingPopup.find(`.${MODULE_NAME}_append`).val();
                        this._savePrompt(index, prompt);
                        existingPopup.remove();
                        $button.data('popup', null);
                    } else if (action === 'discard') {
                        existingPopup.remove();
                        $button.data('popup', null);
                    }
                });
            } else {
                existingPopup.remove();
                $button.data('popup', null);
            }
            return;
        }

        const index = parseInt($button.closest('[mesid]').attr('mesid'));
        if (isNaN(index)) return;

        const $template = await this._loadTemplate();

        const prefixArea = $template.find(`.${MODULE_NAME}_prepend`);
        const postfixArea = $template.find(`.${MODULE_NAME}_append`);
        prefixArea.val(prompt.prefix || "");
        postfixArea.val(prompt.postfix || "");

        $template.find(`.${MODULE_NAME}_save`).on('click', () => {
            prompt.prefix = prefixArea.val();
            prompt.postfix = postfixArea.val();
            this._savePrompt(index, prompt);
            $template.remove();
            $button.data('popup', null);
        });

        $template.find(`.${MODULE_NAME}_close`).on('click', () => {
            if (this._hasChanges($template, prompt)) {
                this._showConfirmPopup((action) => {
                    if (action === 'save') {
                        prompt.prefix = $template.find(`.${MODULE_NAME}_prepend`).val();
                        prompt.postfix = $template.find(`.${MODULE_NAME}_append`).val();
                        this._savePrompt(index, prompt);
                        $template.remove();
                        $button.data('popup', null);
                    } else if (action === 'discard') {
                        $template.remove();
                        $button.data('popup', null);
                    }
                });
            } else {
                $template.remove();
                $button.data('popup', null);
            }
        });

        // --- Dynamic Alignment to $chat Boundaries ---
        const chatLeft = this.$chat.offset().left;
        const chatWidth = this.$chat.outerWidth();
        const btnTop = $button.offset().top;
        const btnHeight = $button.outerHeight();

        // Force the popup to perfectly align flush with the main chat stream window
        const finalLeft = chatLeft;
        const finalWidth = chatWidth;

        // 1. Stage the component invisibly to compute accurate textwrapping heights
        $template.css({
            position: 'fixed',
            left: `${finalLeft}px`,
            width: `${finalWidth}px`,
            zIndex: 10000,
            visibility: 'hidden'
        });

        $button.data('popup', $template);
        $('body').append($template);

        // 2. Measure actual computed bounding box height
        const popupHeight = $template.outerHeight();
        const windowHeight = window.innerHeight;
        const spaceBelow = windowHeight - (btnTop + btnHeight);

        // 3. Compute Vertical Trajectory relative to the clicked button icon
        let finalTop;
        if (spaceBelow < popupHeight && btnTop >= popupHeight) {
            // VERTICAL FLIP: Open upwards if there's no room below
            finalTop = btnTop - popupHeight;
        } else {
            // Normal Trajectory: Open downwards directly underneath the name line
            finalTop = btnTop + btnHeight;
        }

        // 4. Snap coordinates and reveal panel seamlessly
        $template.css({
            top: `${finalTop}px`,
            visibility: 'visible'
        });
    }

    _saveCurrentPrompt(pre, post) {
        this.appendCurrentPrompt = true;
        this.currentPrompt.prefix = pre;
        this.currentPrompt.postfix = post;
        this._save(this.currentPrompt);
        setChatMetadata(DirectCommandManager.PROMPT_COMMAND_APPEND, this.appendCurrentPrompt, false);
        this._updateButtonState();
    }

    _savePrompt(index, prompt) {
        this._save(prompt, index);
    }

    _save(command, index = undefined) {
        if (command) {
            if (index !== undefined) {
                const context = SillyTavern.getContext();
                const message = context.chat[index];
                if (message) {
                    this._setDirectCommand(message, command);
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

    _hasChanges($popup, originalPrompt) {
        const pre = $popup.find(`.${MODULE_NAME}_prepend`).val() || "";
        const post = $popup.find(`.${MODULE_NAME}_append`).val() || "";
        return pre !== (originalPrompt.prefix || "") || post !== (originalPrompt.postfix || "");
    }

    _showConfirmPopup(callback) {
        const confirmHtml = `
            <div class="${MODULE_NAME}_confirm_container">
                <div class="${MODULE_NAME}_confirm_message">You have unsaved changes. Do you want to save them?</div>
                <div class="${MODULE_NAME}_confirm_buttons">
                    <button class="${MODULE_NAME}_confirm_btn ${MODULE_NAME}_confirm_save menu_button">Save</button>
                    <button class="${MODULE_NAME}_confirm_btn ${MODULE_NAME}_confirm_discard menu_button red_button">Discard</button>
                    <button class="${MODULE_NAME}_confirm_btn ${MODULE_NAME}_confirm_cancel menu_button">Cancel</button>
                </div>
            </div>
        `;
        const $confirm = $(confirmHtml);
        $confirm.find(`.${MODULE_NAME}_confirm_save`).on('click', () => {
            callback('save');
            $confirm.remove();
        });
        $confirm.find(`.${MODULE_NAME}_confirm_discard`).on('click', () => {
            callback('discard');
            $confirm.remove();
        });
        $confirm.find(`.${MODULE_NAME}_confirm_cancel`).on('click', () => {
            callback('cancel');
            $confirm.remove();
        });
        $('body').append($confirm);
    }

    _updateButtonState() {
        if (!this.$openButton) return;
        if (this.currentPrompt.prefix || this.currentPrompt.postfix) {
            // Uses SillyTavern's active theme accent color for quote highlights with a emerald fallback
            this.$openButton.css('color', 'var(--SmartThemeQuoteColor, #00bc8c)');
        } else {
            this.$openButton.css('color', ''); // Revert to default theme icon color
        }
    }
}

let manager = null;

$(async function () {
    manager = new DirectCommandManager();
    for (let event of [event_types.APP_INITIALIZED, event_types.CHAT_CHANGED]) {
        eventSource.on(event, async () => {
            await manager.wire();
        });
    }

    eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, async (data) => {
        manager.processPrompt(data);
    });
    eventSource.on(event_types.USER_MESSAGE_RENDERED, async (messageId) => {
        await manager.storeDirectCommand(messageId);
    });
    for (let event of [event_types.CHAT_LOADED]) {
        eventSource.on(event, async () => {
            await manager.onChatRefresh();
        });
    }
});
