import i18n from "i18next";
import I18FileSystemBackend from "i18next-fs-backend";
import osLocale from "os-locale";
import isDebugging from "is-debugging";
import * as path from "path";
import main from "./app/main";

require("dotenv").config({ debug: isDebugging }); // eslint-disable-line

i18n
    .use(I18FileSystemBackend)
    .init({
        debug: isDebugging,
        lng: osLocale.sync().slice(0, 2),
        ns: [
            "main",
            "err",
            "log",
        ],
        fallbackLng: "en",
        pluralSeparator: "#",
        contextSeparator: "@",
        backend: {
            loadPath: path.join(__dirname, "./assets/locales/{{lng}}/language/{{ns}}.json"),
            addPath: path.join(__dirname, "./assets/locales/{{lng}}/language/{{ns}}.missing.json"),
        },
        initImmediate: false,
    })
        .then(main)
        .catch((e) => {
            console.error(`COULD_NOT_START: ${e}`);
            process.exit(1);
        });
