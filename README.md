# SillyTavern-DirectCommand

DirectCommand is a SillyTavern extension designed to give you precise, localized control over individual text generation turns. It allows you to surgically prepend or append instructions to the outgoing prompt payload without permanently polluting your long-term chat history context.

## Features

* **Global Direct Commands**: Inject custom instructions into the prompt payload for your very next message submission.
* **Per-Message History Editing**: Attach, modify, or review stored command payloads for individual past user messages directly from the chat timeline.
* **One-Shot Prompt Isolation**: Commands only target the active generation turn and do not leak into subsequent chat turns.
* **Persistence & Rollback Support**: Commands are securely bound to message metadata, meaning they persist across chat reloads and remain intact if you delete turns or roll back history.

## Installation

1. Copy the extension folder into your SillyTavern installation directory under `public/extensions/third-party/SillyTavern-DirectCommand`. OR Install via Install Extension button and copy url of this repo. 
2. Restart SillyTavern or reload your browser tab.

## How It Works

### 1. Global Commands (The Next Generation)
* Click the **Robot Icon** (`fa-robot`) added next to the extensions menu button to open the global prompt configuration panel.
* Enter your text into the **Prepend to prompt** and/or **Append to prompt** input areas.
* Click **Save** or submit your message normally using the chat bar.
* The extension automatically bundles these instructions into the outgoing user prompt payload and clears itself for the next turn.

### 2. Historical Commands (Timeline Adjustments)
* Any user message sent with an active direct command will display a small **Robot Icon** next to the username in the chat view.
* Click this icon to open an inline menu where you can view, edit, or completely change the prepend/append parameters used for that specific historical node.
* If you alter a saved command and attempt to close the popup without saving, an interactive confirmation dialog will safeguard your changes.

## Configuration Metadata

The extension utilizes SillyTavern's standard modular lifecycle:
* **Extension Name**: `SillyTavern-DirectCommand`
* **Module Identifier**: `enerccio_directcommand`
* **Stored Keys**: Tracks `command` variables within message objects and `prompt_command` settings inside chat session metadata.
