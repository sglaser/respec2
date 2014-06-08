/*global define, respecVersion, require */
/*jshint laxcomma:true, browser:true */

// this is only set in a build, not at all in the dev environment
var requireConfig = {
    shim:   {
        "shortcut": {
            exports:    "shortcut"
        }
    }
};
if ("respecVersion" in window && respecVersion) {
    requireConfig.paths = {
        "ui":   "https://sglaser.github.io/respec/js/ui"
    };
}
require.config(requireConfig);

define([
            "domReady"
        ,   "core/base-runner"
        ,   "core/ui"
        ,   "core/override-configuration"
        ,   "core/default-root-attr"
        ,   "core/markdown"
        ,   "core/style"
        ,   "pcisig/style"
        ,   "pcisig/headers"
        ,   "core/footnotes"
        ,   "w3c/abstract"
        ,   "pcisig/conformance"
        ,   "core/data-transform"
        ,   "core/data-include"
        ,   "core/inlines"
        ,   "core/examples"
        ,   "core/issues-notes"
        ,   "core/requirements"
        ,   "core/highlight"
        ,   "core/best-practices"
        ,   "core/figures"
        ,   "core/tables"
        ,   "core/biblio"
        ,   "core/rdfa"
        ,   "core/webidl-oldschool"
        ,   "core/regpict"
        ,   "core/dfn"
        ,   "core/fix-headers"
        ,   "core/structure"
        ,   "w3c/informative"
        ,   "w3c/permalinks"
        ,   "core/id-headers"
        ,   "w3c/aria"
        ,   "core/remove-respec"
        ,   "core/location-hash"
        ],
        function (domReady, runner, ui) {
            "use strict";
            var args = Array.prototype.slice.call(arguments);
            domReady(function () {
                ui.addCommand("Save Snapshot", "ui/save-html", "Ctrl+Shift+Alt+S");
                ui.addCommand("About ReSpec", "ui/about-respec", "Ctrl+Shift+Alt+A");
                ui.addCommand("Search Specref DB", "ui/search-specref", "Ctrl+Shift+Alt+space");
                runner.runAll(args);
            });
        }
);
