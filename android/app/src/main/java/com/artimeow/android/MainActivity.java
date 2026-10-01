package com.artimeow.android;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public final class MainActivity extends Activity {
    private static final int PICK_PROJECT = 41;
    private WebView editor;
    private WebView player;
    private WebView activeView;
    private TextView status;
    private String pendingPickId;
    private String pendingMode;
    private WebView pendingWebView;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(25, 28, 48));
        getWindow().setNavigationBarColor(Color.rgb(25, 28, 48));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.rgb(20, 22, 38));

        LinearLayout tabs = new LinearLayout(this);
        tabs.setBackgroundColor(Color.rgb(25, 28, 48));
        Button editorTab = tab("Editor");
        Button playerTab = tab("Player");
        tabs.addView(editorTab, new LinearLayout.LayoutParams(0, dp(48), 1));
        tabs.addView(playerTab, new LinearLayout.LayoutParams(0, dp(48), 1));
        root.addView(tabs);

        status = new TextView(this);
        status.setTextColor(Color.WHITE);
        status.setTextSize(12);
        status.setPadding(dp(12), dp(4), dp(12), dp(4));
        status.setBackgroundColor(Color.rgb(25, 28, 48));
        status.setText("Android edition · Projects are stored in app documents");
        root.addView(status);

        FrameLayout content = new FrameLayout(this);
        editor = createWebView();
        player = createWebView();
        content.addView(editor);
        content.addView(player);
        root.addView(content, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);

        editorTab.setOnClickListener(v -> showMode("editor"));
        playerTab.setOnClickListener(v -> showMode("player"));
        showMode("editor");
        editor.loadUrl("file:///android_asset/editor/index.html");
        player.loadUrl("file:///android_asset/player/index.html");
    }

    private Button tab(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextColor(Color.WHITE);
        button.setTextSize(14);
        button.setAllCaps(false);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(25, 28, 48)));
        return button;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private WebView createWebView() {
        WebView view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setDatabaseEnabled(true);
        settings.setDefaultTextEncodingName("UTF-8");
        view.addJavascriptInterface(new AndroidBridge(view), "AndroidBridge");
        view.setWebChromeClient(new WebChromeClient());
        view.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView webView, String url) {
                super.onPageFinished(webView, url);
                webView.evaluateJavascript(
                    "(()=>{const s=document.createElement('style');s.textContent=" +
                    "'html,body{overscroll-behavior:none;-webkit-tap-highlight-color:transparent}'+" +
                    "'.titlebar{display:none!important}button,input,textarea,select{touch-action:manipulation}';" +
                    "document.head.appendChild(s)})()", null);
            }
        });
        return view;
    }

    private void showMode(String mode) {
        activeView = "player".equals(mode) ? player : editor;
        if (editor != null) editor.setVisibility("editor".equals(mode) ? View.VISIBLE : View.GONE);
        if (player != null) player.setVisibility("player".equals(mode) ? View.VISIBLE : View.GONE);
        if (status != null) status.setText("player".equals(mode)
            ? "Player · Open an exported project folder to play"
            : "Editor · AI generation and desktop packaging are not available on Android");
    }

    @Override
    public void onBackPressed() {
        if (activeView != null && activeView.canGoBack()) {
            activeView.goBack();
        } else if (player != null && player.getVisibility() == View.VISIBLE) {
            showMode("editor");
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_PROJECT || pendingPickId == null) return;
        String result = "";
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri uri = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(
                    uri, data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION));
            } catch (Exception ignored) {}
            try {
                File destination = new File(projectsDirectory(pendingMode), "Imported-" + System.currentTimeMillis());
                copyTree(uri, destination);
                result = JSONObject.quote(destination.getAbsolutePath());
                status.setText("Imported project into " + destination.getName());
            } catch (Exception error) {
                result = "null";
                status.setText("Could not import project: " + error.getMessage());
            }
        } else {
            result = "null";
        }
        final String id = pendingPickId;
        final String value = result;
        if (pendingWebView != null) {
            pendingWebView.evaluateJavascript("window.__androidComplete(" + JSONObject.quote(id) + "," + value + ")", null);
        }
        pendingPickId = null;
        pendingMode = null;
        pendingWebView = null;
    }

    private File projectsDirectory(String mode) {
        File dir = new File(getExternalFilesDir(null), "ArtiMeow/" + mode + "-projects");
        if (!dir.exists()) dir.mkdirs();
        return dir;
    }

    private void copyTree(Uri tree, File destination) throws Exception {
        destination.mkdirs();
        String documentId = android.provider.DocumentsContract.getTreeDocumentId(tree);
        Uri rootUri = android.provider.DocumentsContract.buildDocumentUriUsingTree(tree, documentId);
        copyDocumentChildren(tree, rootUri, destination);
    }

    private void copyDocumentChildren(Uri tree, Uri parent, File destination) throws Exception {
        String id = android.provider.DocumentsContract.getDocumentId(parent);
        Uri children = android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(tree, id);
        try (android.database.Cursor cursor = getContentResolver().query(children,
            new String[]{android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                android.provider.DocumentsContract.Document.COLUMN_MIME_TYPE},
            null, null, null)) {
            if (cursor == null) return;
            while (cursor.moveToNext()) {
                String childId = cursor.getString(0);
                String name = new File(cursor.getString(1)).getName();
                if (name.isEmpty() || name.equals(".") || name.equals("..")) continue;
                Uri childUri = android.provider.DocumentsContract.buildDocumentUriUsingTree(tree, childId);
                File child = new File(destination, name);
                if ("vnd.android.document/directory".equals(cursor.getString(2))) {
                    copyDocumentChildren(tree, childUri, child);
                } else {
                    try (InputStream input = getContentResolver().openInputStream(childUri);
                         FileOutputStream output = new FileOutputStream(child)) {
                        if (input == null) continue;
                        byte[] buffer = new byte[8192];
                        int count;
                        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                    }
                }
            }
        }
    }

    private final class AndroidBridge {
        private final WebView webView;

        AndroidBridge(WebView webView) {
            this.webView = webView;
        }

        @JavascriptInterface
        public String invoke(String channel, String encodedArgs) {
            try {
                JSONArray args = new JSONArray(encodedArgs);
                return JSONObject.valueToString(handle(channel, args, webView));
            } catch (Exception error) {
                return JSONObject.valueToString(new JSONObject().put("success", false).put("error", error.getMessage()));
            }
        }

        @JavascriptInterface
        public String requestProjectFolder(String mode) {
            String id = UUID.randomUUID().toString();
            pendingPickId = id;
            pendingMode = "player".equals(mode) ? "player" : "editor";
            pendingWebView = webView;
            activeView = webView;
            runOnUiThread(() -> {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
                    Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
                startActivityForResult(intent, PICK_PROJECT);
            });
            return id;
        }
    }

    private Object handle(String channel, JSONArray a, WebView source) throws Exception {
        File base = new File(getExternalFilesDir(null), "ArtiMeow");
        File editorProjects = projectsDirectory("editor");
        File playerProjects = projectsDirectory("player");
        if (channel.equals("get-documents-path")) return base.getAbsolutePath();
        if (channel.equals("get-downloads-path")) return getExternalFilesDir(android.os.Environment.DIRECTORY_DOWNLOADS).getAbsolutePath();
        if (channel.equals("get-data-dir")) return playerProjects.getAbsolutePath();
        if (channel.equals("galgame-get-projects-dir")) return editorProjects.getAbsolutePath();
        if (channel.equals("get-app-path") || channel.equals("app-get-path")) return getFilesDir().getAbsolutePath();
        if (channel.equals("get-app-version") || channel.equals("get-app-version-info")) {
            return new JSONObject().put("app", new JSONObject().put("version", "1.0.0").put("name", "ArtiMeow Android"));
        }
        if (channel.equals("get-platform")) return "android";
        if (channel.equals("get-settings")) return readSetting("settings", new JSONObject());
        if (channel.equals("save-settings") || channel.equals("update-settings")) {
            saveSetting("settings", a.optJSONObject(0));
            return new JSONObject().put("success", true);
        }
        if (channel.equals("get-project-list") || channel.equals("galgame-get-project-list")) {
            JSONArray projects = new JSONArray();
            File[] items = editorProjects.listFiles();
            if (items != null) for (File item : items) {
                File metadata = new File(item, "metadata.json");
                if (item.isDirectory() && metadata.isFile()) {
                    JSONObject row = new JSONObject(new String(readBytes(metadata), StandardCharsets.UTF_8));
                    row.put("path", item.getAbsolutePath());
                    projects.put(row);
                }
            }
            return new JSONObject().put("success", true).put("projects", projects);
        }

        if (channel.equals("galgame-create-project")) return createGalgameProject(a.optJSONObject(0), editorProjects);
        if (channel.equals("galgame-load-project")) return loadGalgameProject(a.optString(0));
        if (channel.equals("galgame-save-project")) {
            File projectFile = safeFile(a.optString(0) + "/data/project.json");
            writeJson(projectFile, a.optJSONObject(1));
            return new JSONObject().put("success", true);
        }
        if (channel.equals("create-project")) return createEditorProject(a.optJSONObject(0), editorProjects);
        if (channel.equals("open-project") || channel.equals("load-project")) return openEditorProject(a.optString(0));
        if (channel.equals("player-load-project")) {
            File dir = safeFile(a.optString(0));
            File config = new File(dir, "project.json");
            if (!config.isFile()) config = new File(new File(dir, "data"), "project.json");
            JSONObject project = new JSONObject(new String(readBytes(config), StandardCharsets.UTF_8));
            String title = project.optString("name", project.optJSONObject("info") == null
                ? config.getParentFile().getName() : project.optJSONObject("info").optString("title", "Game"));
            return new JSONObject().put("name", title).put("projectPath", config.getParentFile().getAbsolutePath())
                .put("projectDir", config.getParentFile().getAbsolutePath()).put("path", config.getParentFile().getAbsolutePath())
                .put("chapters", project.optJSONArray("chapters") == null ? new JSONArray() : project.optJSONArray("chapters"));
        }

        if (channel.equals("storage-get")) return readSetting("storage:" + a.optString(0), JSONObject.NULL);
        if (channel.equals("storage-set")) {
            saveSetting("storage:" + a.optString(0), a.opt(1));
            return true;
        }
        if (channel.equals("get-recent-projects")) return readSetting("recent-projects", new JSONArray());
        if (channel.equals("add-recent-project")) return true;

        if (channel.equals("path-exists") || channel.equals("fs-exists")) return safeFile(a.optString(0)).exists();
        if (channel.equals("read-file") || channel.equals("fs-read-file")) {
            String content = new String(readBytes(safeFile(a.optString(0))), StandardCharsets.UTF_8);
            return channel.equals("read-file")
                ? new JSONObject().put("success", true).put("content", content) : content;
        }
        if (channel.equals("read-json-file")) {
            return new JSONObject().put("success", true).put("data",
                new JSONObject(new String(readBytes(safeFile(a.optString(0))), StandardCharsets.UTF_8)));
        }
        if (channel.equals("fs-read-json")) {
            return new JSONObject(new String(readBytes(safeFile(a.optString(0))), StandardCharsets.UTF_8));
        }
        if (channel.equals("write-file")) {
            writeBytes(safeFile(a.optString(0)), a.optString(1).getBytes(StandardCharsets.UTF_8));
            return new JSONObject().put("success", true);
        }
        if (channel.equals("write-json-file") || channel.equals("fs-write-json")) {
            writeJson(safeFile(a.optString(0)), a.optJSONObject(1));
            return new JSONObject().put("success", true);
        }
        if (channel.equals("ensure-dir") || channel.equals("create-directory") || channel.equals("fs-ensure-dir")) {
            safeFile(a.optString(0)).mkdirs();
            return true;
        }
        if (channel.equals("fs-readdir") || channel.equals("list-directory")) {
            JSONArray list = new JSONArray();
            File[] files = safeFile(a.optString(0)).listFiles();
            if (files != null) for (File file : files) list.put(file.getName());
            return list;
        }
        if (channel.equals("scan-directory")) return scanFiles(safeFile(a.optString(0)), new JSONArray());
        if (channel.equals("scan-directory-with-dirs")) return scanDirectory(safeFile(a.optString(0)), true);
        if (channel.equals("get-file-stats") || channel.equals("fs-stat")) {
            File file = safeFile(a.optString(0));
            return new JSONObject().put("isDirectory", file.isDirectory()).put("size", file.length())
                .put("mtime", file.lastModified());
        }
        if (channel.equals("delete-file") || channel.equals("delete-directory") || channel.equals("fs-remove")) {
            deleteRecursively(safeFile(a.optString(0)));
            return true;
        }
        if (channel.equals("move-file") || channel.equals("fs-move")) {
            File src = safeFile(a.optString(0));
            File dest = safeFile(a.optString(1));
            if (dest.getParentFile() != null) dest.getParentFile().mkdirs();
            if (!src.renameTo(dest)) copyRecursively(src, dest);
            return true;
        }
        if (channel.equals("copy-file") || channel.equals("fs-copy")) {
            copyRecursively(safeFile(a.optString(0)), safeFile(a.optString(1)));
            return true;
        }
        if (channel.equals("show-open-dialog")) {
            String id = new AndroidBridge(source).requestProjectFolder(
                source == player ? "player" : "editor");
            return new JSONObject().put("__pendingId", id);
        }
        if (channel.equals("show-save-dialog")) return new JSONObject().put("canceled", true);
        if (channel.equals("shell-open-external")) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(a.optString(0)));
            runOnUiThread(() -> startActivity(intent));
            return new JSONObject().put("success", true);
        }
        if (channel.equals("get-system-fonts")) return new JSONArray();
        if (channel.equals("get-tutorial-directory")) return new File(base, "tutorial").getAbsolutePath();
        if (channel.equals("read-tutorial-files")) return new JSONArray();
        if (channel.startsWith("git-") || channel.startsWith("packager-") ||
            channel.equals("check-node-env") || channel.startsWith("editor-") ||
            channel.equals("preview-project") || channel.equals("galgame-package-project")) {
            return new JSONObject().put("success", false)
                .put("error", "This desktop-only feature is not available in the Android edition.");
        }
        return JSONObject.NULL;
    }

    private Object createGalgameProject(JSONObject data, File root) throws Exception {
        String id = data.optString("id", UUID.randomUUID().toString());
        File folder = new File(root, id);
        File dataDir = new File(folder, "data");
        dataDir.mkdirs();
        new File(dataDir, "assets/backgrounds").mkdirs();
        new File(dataDir, "assets/characters").mkdirs();
        new File(dataDir, "assets/music").mkdirs();
        JSONObject info = new JSONObject().put("id", id).put("title", data.optString("title", "New Game"))
            .put("description", data.optString("description", "")).put("author", data.optString("author", ""))
            .put("version", "1.0.0").put("createdAt", System.currentTimeMillis());
        JSONObject project = new JSONObject().put("info", info).put("chapters", new JSONArray())
            .put("characters", new JSONArray()).put("variables", new JSONObject())
            .put("settings", new JSONObject().put("music", new JSONObject()).put("ui", new JSONObject()));
        writeJson(new File(dataDir, "project.json"), project);
        writeJson(new File(folder, "metadata.json"), info);
        return new JSONObject().put("success", true).put("projectPath", folder.getAbsolutePath());
    }

    private Object loadGalgameProject(String path) throws Exception {
        File projectFile = safeFile(path + "/data/project.json");
        if (!projectFile.isFile()) projectFile = safeFile(path + "/project.json");
        JSONObject project = new JSONObject(new String(readBytes(projectFile), StandardCharsets.UTF_8));
        JSONObject info = project.optJSONObject("info");
        JSONObject result = new JSONObject().put("success", true)
            .put("project", new JSONObject().put("info", info == null ? new JSONObject() : info)
                .put("chapters", project.optJSONArray("chapters") == null ? new JSONArray() : project.optJSONArray("chapters")))
            .put("dataPath", projectFile.getParentFile().getAbsolutePath());
        return result;
    }

    private Object createEditorProject(JSONObject data, File root) throws Exception {
        String id = UUID.randomUUID().toString();
        File dir = new File(root, id);
        dir.mkdirs();
        new File(dir, "chapters").mkdirs();
        new File(dir, "assets/images").mkdirs();
        new File(dir, "assets/audio").mkdirs();
        JSONObject metadata = data == null ? new JSONObject() : new JSONObject(data.toString());
        metadata.put("id", id).put("title", metadata.optString("title", metadata.optString("name", "New Project")))
            .put("updatedAt", System.currentTimeMillis());
        writeJson(new File(dir, "metadata.json"), metadata);
        JSONObject project = new JSONObject().put("id", id).put("name", metadata.optString("title"))
            .put("title", metadata.optString("title")).put("chapters", new JSONArray()).put("settings", new JSONObject());
        writeJson(new File(dir, "project.json"), project);
        return new JSONObject().put("success", true).put("project", project.put("path", dir.getAbsolutePath()))
            .put("projectPath", dir.getAbsolutePath());
    }

    private Object openEditorProject(String path) throws Exception {
        File dir = safeFile(path);
        File metadata = new File(dir, "metadata.json");
        File projectFile = new File(dir, "project.json");
        JSONObject project = new JSONObject(new String(readBytes(metadata.isFile() ? metadata : projectFile), StandardCharsets.UTF_8));
        project.put("path", dir.getAbsolutePath()).put("metadata", project);
        return new JSONObject().put("success", true).put("project", project).put("content", "");
    }

    private JSONArray scanFiles(File dir, JSONArray result) {
        File[] files = dir.listFiles();
        if (files != null) for (File file : files) {
            if (file.isDirectory()) scanFiles(file, result);
            else result.put(file.getAbsolutePath().replace(File.separatorChar, '/'));
        }
        return result;
    }

    private JSONArray scanDirectory(File dir, boolean includeDirectories) {
        JSONArray result = new JSONArray();
        File[] files = dir.listFiles();
        if (files != null) for (File file : files) {
            if (!includeDirectories && file.isDirectory()) continue;
            result.put(new JSONObject().put("name", file.getName()).put("path", file.getAbsolutePath())
                .put("isDirectory", file.isDirectory()).put("size", file.length()));
        }
        return result;
    }

    private File safeFile(String path) throws Exception {
        File resolved = new File(path);
        if (!resolved.isAbsolute()) resolved = new File(getExternalFilesDir(null), path);
        String candidate = resolved.getCanonicalPath();
        String external = getExternalFilesDir(null).getCanonicalPath();
        String internal = getFilesDir().getCanonicalPath();
        if (!candidate.startsWith(external + File.separator) && !candidate.equals(external) &&
            !candidate.startsWith(internal + File.separator) && !candidate.equals(internal)) {
            throw new SecurityException("Path is outside the app's private storage.");
        }
        return new File(candidate);
    }

    private JSONObject readSetting(String key, JSONObject fallback) {
        try {
            String json = getSharedPreferences("artimeow", MODE_PRIVATE).getString(key, fallback.toString());
            return new JSONObject(json);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private Object readSetting(String key, JSONArray fallback) {
        try {
            return new JSONArray(getSharedPreferences("artimeow", MODE_PRIVATE).getString(key, fallback.toString()));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private Object readSetting(String key, Object fallback) {
        String raw = getSharedPreferences("artimeow", MODE_PRIVATE).getString(key, null);
        if (raw == null) return fallback;
        try {
            return raw.startsWith("{") ? new JSONObject(raw) : raw.startsWith("[") ? new JSONArray(raw) :
                raw.equals("true") ? true : raw.equals("false") ? false : raw;
        } catch (Exception ignored) {
            return raw;
        }
    }

    private void saveSetting(String key, Object value) {
        getSharedPreferences("artimeow", MODE_PRIVATE).edit()
            .putString(key, value == null || value == JSONObject.NULL ? "null" : value.toString()).apply();
    }

    private void writeJson(File file, JSONObject value) throws Exception {
        writeBytes(file, (value == null ? "{}" : value.toString(2)).getBytes(StandardCharsets.UTF_8));
    }

    private byte[] readBytes(File file) throws Exception {
        try (InputStream input = new java.io.FileInputStream(file);
             java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    private void writeBytes(File file, byte[] content) throws Exception {
        File parent = file.getParentFile();
        if (parent != null) parent.mkdirs();
        try (FileOutputStream output = new FileOutputStream(file)) {
            output.write(content);
        }
    }

    private void deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursively(child);
        }
        file.delete();
    }

    private void copyRecursively(File source, File destination) throws Exception {
        if (source.isDirectory()) {
            destination.mkdirs();
            File[] children = source.listFiles();
            if (children != null) for (File child : children) copyRecursively(child, new File(destination, child.getName()));
        } else {
            writeBytes(destination, readBytes(source));
        }
    }
}
