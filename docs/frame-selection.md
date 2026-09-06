# Export a selection inside a frame

Select text inside an embedded frame, right-click that selection, and choose **Download selection as Markdown**. The background controller now injects and sends the extraction request to the context menu's originating frame. Replies from scripts previously installed in other frames cannot win a broadcast race.

Toolbar, keyboard shortcuts, automatic-page and main-content exports retain their top-frame scope. Use the context menu for a selection in a nested frame.

This does not grant access to additional sites. Chrome still enforces the extension's existing `activeTab` and `scripting` permissions. An inaccessible cross-origin, sandboxed, restricted or removed frame can fail; the exporter must not silently replace that selection with the main page. A manual smoke check should cover an accessible same-origin frame and a denied frame before store release.

The frame ID is reused across the existing transient retry, while per-tab deduplication and all capture/download timeouts are unchanged. Frame IDs are not document IDs: navigation between injection and extraction remains a separate possible race.

Controller regression tests: `node --test tests/frame-selection.test.mjs`.

Chrome API references:
- https://developer.chrome.com/docs/extensions/reference/api/contextMenus#type-OnClickData
- https://developer.chrome.com/docs/extensions/reference/api/scripting#type-InjectionTarget
- https://developer.chrome.com/docs/extensions/reference/api/tabs#method-sendMessage
