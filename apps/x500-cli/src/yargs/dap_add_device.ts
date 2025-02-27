import type { Context } from "../types";
import type { CommandModule } from "yargs";
import bind from "../net/bind";
import addEntry from "../commands/dap/add/device";

// device OBJECT-CLASS ::= {
//     SUBCLASS OF   {top}
//     MUST CONTAIN  {commonName}
//     MAY CONTAIN   {description |
//                    localityName |
//                    organizationName |
//                    organizationalUnitName |
//                    owner |
//                    seeAlso |
//                    serialNumber}
//     LDAP-NAME      {"device"}  -- RFC 4519
//     ID            id-oc-device }

export
function create (ctx: Context): CommandModule {
    return {
        command: "device <object> <commonName>",
        describe: "Add a device",
        builder: (yargs) => {
            return yargs
                .positional("object", {
                    type: "string",
                    description: "The object",
                })
                .positional("commonName", {
                    type: "string",
                    description: "The common name",
                })
                .option("description", {
                    alias: "d",
                    type: "array",
                    description: "An arbitrary description",
                })
                .option("seeAlso", {
                    alias: "a",
                    type: "array",
                    description: "The distinguished name of another related entry",
                })
                .option("localityName", {
                    alias: "l",
                    type: "array",
                    description: "The name of the locality"
                })
                .option("organizationName", {
                    alias: "o",
                    type: "array",
                    description: "The organization name",
                })
                .option("organizationUnitName", {
                    alias: "u",
                    type: "array",
                    description: "The organizational unit name",
                })
                .option("owner", {
                    alias: "w",
                    type: "array",
                    description: "The owner of the device",
                })
                .option("serialNumber", {
                    alias: "s",
                    type: "array",
                    description: "The serial number of the device",
                })
                .demandOption("commonName")
                .help()
                ;
        },
        handler: async (argv) => {
            const connection = await bind(ctx, argv);
            await addEntry(ctx, connection, argv);
            await connection.close();
        },
    };
}

export default create;
