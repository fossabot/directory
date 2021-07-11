import { Context, Entry } from "./types";
import * as net from "net";
import * as tls from "tls";
import * as fs from "fs";
import { IdmBind } from "@wildboar/x500/src/lib/modules/IDMProtocolSpecification/IdmBind.ta";
import { IDMConnection } from "@wildboar/idm";
import { dap_ip } from "@wildboar/x500/src/lib/modules/DirectoryIDMProtocols/dap-ip.oa";
import { dsp_ip } from "@wildboar/x500/src/lib/modules/DirectoryIDMProtocols/dsp-ip.oa";
import DAPConnection from "./dap/DAPConnection";
import DSPConnection from "./dsp/DSPConnection";
import {
    _decode_DirectoryBindArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/DirectoryBindArgument.ta";
import objectClassFromInformationObject from "./x500/objectClassFromInformationObject";
import {
    top,
} from "@wildboar/x500/src/lib/modules/InformationFramework/top.oa";
import LDAPConnection from "./ldap/LDAPConnection";
import loadDIT from "./database/loadDIT";
import { v4 as uuid } from "uuid";
import { PrismaClient } from "@prisma/client";
import { strict as assert } from "assert";
import initDIT from "./database/initDIT";
import loadAttributeTypes from "./x500/loadAttributeTypes";
import loadObjectClasses from "./x500/loadObjectClasses";
import loadLDAPSyntaxes from "./x500/loadLDAPSyntaxes";

const DEFAULT_IDM_TCP_PORT: number = 4632;
const DEFAULT_LDAP_TCP_PORT: number = 1389;
const DEFAULT_LDAPS_TCP_PORT: number = 1636;

export default
async function main (): Promise<void> {
    const rootID = uuid();
    const rootDSE: Entry = {
        id: 0,
        uuid: rootID,
        objectClass: new Set(),
        rdn: [],
        dseType: {
            root: true,
        },
        children: [],
        creatorsName: {
            rdnSequence: [],
        },
        modifiersName: {
            rdnSequence: [],
        },
        createdTimestamp: new Date(),
        modifyTimestamp: new Date(),
    };
    const ctx: Context = {
        dit: {
            id: 1,
            uuid: "b47a393d-f561-4020-b8e8-324ae3391e98",
        },
        log: console,
        db: new PrismaClient(),
        database: {
            data: {
                dit: rootDSE,
                values: [],
            },
        },
        structuralObjectClassHierarchy: {
            ...objectClassFromInformationObject(top),
            parent: undefined,
            children: [],
        },
        objectClasses: new Map([]),
        attributes: new Map([]),
        equalityMatchingRules: new Map([]),
        orderingMatchingRules: new Map([]),
        substringsMatchingRules: new Map([]),
        approxMatchingRules: new Map([]),
        contextMatchers: new Map([]),
        pagedResultsRequests: new Map([]),
        ldapSyntaxes: new Map([]),
    };

    ctx.log.info(`Loading DIT with UUID ${ctx.dit.uuid} into memory. This could take a while.`);
    let dit = await loadDIT(ctx);
    if (!dit) {
        const ditsCount: number = await ctx.db.dIT.count();
        if (ditsCount === 0) {
            await initDIT(ctx, "Default DIT");
            dit = await loadDIT(ctx);
        } else {
            throw new Error(`DIT with UUID ${ctx.dit.uuid} not found.`);
        }
    }
    assert(dit);
    ctx.log.info(`DIT with UUID ${ctx.dit.uuid} loaded into memory.`);
    ctx.database.data.dit = dit;

    // The ordering of these is important.
    // Loading LDAP syntaxes before attribute types allows us to use the names instead of OIDs.
    loadObjectClasses(ctx);
    ctx.log.debug("Loaded object classes.");
    loadLDAPSyntaxes(ctx);
    ctx.log.debug("Loaded LDAP syntaxes.");
    loadAttributeTypes(ctx);
    ctx.log.debug("Loaded attribute types.");

    const idmServer = net.createServer((c) => {
        console.log("IDM client connected.");
        const idm = new IDMConnection(c); // eslint-disable-line
        // let dap: DAPConnection | undefined;

        idm.events.on("bind", (idmBind: IdmBind) => {
            if (idmBind.protocolID.isEqualTo(dap_ip["&id"]!)) {
                const dba = _decode_DirectoryBindArgument(idmBind.argument);
                new DAPConnection(ctx, idm, dba); // eslint-disable-line
            } else if (idmBind.protocolID.isEqualTo(dsp_ip["&id"]!)) {
                const dba = _decode_DirectoryBindArgument(idmBind.argument); // FIXME:
                new DSPConnection(ctx, idm, dba);
            } else {
                console.log(`Unsupported protocol: ${idmBind.protocolID.toString()}.`);
            }
        });

        idm.events.on("unbind", () => {
            c.end();
        });

        // idm.events.on("unbind", () => {
        //     dap = undefined;
        // });
    });
    idmServer.on("error", (err) => {
        throw err;
    });

    const idmPort = process.env.IDM_PORT
        ? Number.parseInt(process.env.IDM_PORT, 10)
        : DEFAULT_IDM_TCP_PORT;

    idmServer.listen(idmPort, () => {
        console.log(`IDM server listening on port ${idmPort}`);
    });

    const ldapServer = net.createServer((c) => {
        console.log("LDAP client connected.");
        new LDAPConnection(ctx, c);
    });

    const ldapPort = process.env.LDAP_PORT
        ? Number.parseInt(process.env.LDAP_PORT, 10)
        : DEFAULT_LDAP_TCP_PORT;

    ldapServer.listen(ldapPort, async () => {
        console.log(`LDAP server listening on port ${ldapPort}`);
    });

    if (process.env.SERVER_TLS_CERT && process.env.SERVER_TLS_KEY) {
        const ldapsServer = tls.createServer({
            cert: fs.readFileSync(process.env.SERVER_TLS_CERT),
            key: fs.readFileSync(process.env.SERVER_TLS_KEY),
        }, (c) => {
            console.log("LDAPS client connected.");
            new LDAPConnection(ctx, c);
        });
        const ldapsPort = process.env.LDAPS_PORT
            ? Number.parseInt(process.env.LDAPS_PORT, 10)
            : DEFAULT_LDAPS_TCP_PORT;
        ldapsServer.listen(ldapsPort, async () => {
            console.log(`LDAPS server listening on port ${ldapsPort}`);
        });
    }
}
