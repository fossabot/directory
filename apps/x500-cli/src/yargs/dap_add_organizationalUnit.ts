import type { Context } from "../types";
import type { CommandModule } from "yargs";
import bind from "../net/bind";
import addEntry from "../commands/dap/add/organization";

export
function create (ctx: Context): CommandModule {
    return {
        command: "ou <object>",
        describe: "Add an organizational unit",
        builder: (yargs) => {
            return yargs
                .positional("object", {
                    type: "string",
                    description: "The object",
                })
                .option("organizationUnitName", {
                    alias: "o",
                    type: "array",
                    description: "The organizational unit name",
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
                .option("businessCategory", {
                    alias: "b",
                    type: "array",
                    description: "A string identifying the category of the organization",
                })
                .option("localityName", {
                    alias: "l",
                    type: "array",
                    description: "The name of the locality"
                })
                .option("stateOrProvinceName", {
                    alias: "s",
                    type: "array",
                    description: "The name of the state or province",
                })
                .option("streetAddress", {
                    alias: "a",
                    type: "array",
                    description: "The street address",
                })
                .option("physicalDeliveryOfficeName", {
                    alias: "d",
                    type: "array",
                    description: "The name of the physical delivery office",
                })
                .option("postalAddress", {
                    alias: "p",
                    type: "array",
                    description: "The full, multi-line postal address",
                })
                .option("postalCode", {
                    alias: "z",
                    type: "array",
                    description: "The postal code / ZIP code",
                })
                .option("postOfficeBox", {
                    alias: "q",
                    type: "array",
                    description: "The post office box identifier",
                })
                .option("telephoneNumber", {
                    alias: "t",
                    type: "array",
                    description: "The telephone number",
                })
                .option("facsimileTelephoneNumber", {
                    alias: "f",
                    type: "array",
                    description: "The fax number",
                })
                .option("userPassword", {
                    alias: "u",
                    type: "string",
                    description: "The password for the organization",
                })
                .demandOption("organizationName")
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
