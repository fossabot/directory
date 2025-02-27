import type { Context, OperationStatistics } from "@wildboar/meerkat-types";
import * as errors from "@wildboar/meerkat-types";
import type { MeerkatContext } from "../ctx";
import type {
    AccessPoint,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/AccessPoint.ta";
import {
    DSABindArgument,
    _encode_DSABindArgument,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/DSABindArgument.ta";
import type {
    DSACredentials,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/DSACredentials.ta";
import type { Chained } from "@wildboar/x500/src/lib/types/Chained";
import type { ChainedRequest } from "@wildboar/x500/src/lib/types/ChainedRequest";
import type { ChainedResultOrError } from "@wildboar/x500/src/lib/types/ChainedResultOrError";
import type { ResultOrError } from "@wildboar/x500/src/lib/types/ResultOrError";
import type { OBJECT_IDENTIFIER, INTEGER, ASN1Element } from "asn1-ts";
import * as net from "net";
import * as tls from "tls";
import type Connection from "./Connection";
import type { WriteOperationOptions } from "./Connection";
import { EventEmitter } from "stream";
import { IDMConnection } from "@wildboar/idm";
import * as url from "url";
import {
    Chained_ArgumentType_OPTIONALLY_PROTECTED_Parameter1,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/Chained-ArgumentType-OPTIONALLY-PROTECTED-Parameter1.ta";
import {
    chainedRead,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/chainedRead.oa";
import getOptionallyProtectedValue from "@wildboar/x500/src/lib/utils/getOptionallyProtectedValue";
import {
    serviceError,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/serviceError.oa";
import {
    ServiceErrorData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceErrorData.ta";
import {
    ServiceProblem_timeLimitExceeded,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceProblem.ta";
import createSecurityParameters from "../x500/createSecurityParameters";
import { addMilliseconds, differenceInMilliseconds } from "date-fns";
import { DER } from "asn1-ts/dist/node/functional";
import getServerStatistics from "../telemetry/getServerStatistics";
import codeToString from "@wildboar/x500/src/lib/stringifiers/codeToString";
import { LDAPSocket } from "@wildboar/ldap-socket";
import {
    LDAPMessage,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPMessage.ta";
import {
    LDAPResult_resultCode_success,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPResult-resultCode.ta";
import {
    BindRequest,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/BindRequest.ta";
import {
    SearchResultEntry,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/SearchResultEntry.ta";
import {
    SearchResultReference,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/SearchResultReference.ta";
import encodeLDAPDN from "../ldap/encodeLDAPDN";
import { strict as assert } from "assert";
import dapRequestToLDAPRequest from "../distributed/dapRequestToLDAPRequest";
import {
    ldapResponseToAddEntryResult,
    ldapResponseToCompareResult,
    ldapResponseToListResult,
    ldapResponseToModifyDNResult,
    ldapResponseToModifyEntryResult,
    ldapResponseToReadResult,
    ldapResponseToRemoveEntryResult,
    ldapResponseToSearchResult,
} from "../distributed/ldapResultToDAPReply";
import compareCode from "@wildboar/x500/src/lib/utils/compareCode";
import { addEntry } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/addEntry.oa";
import { compare } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/compare.oa";
import { list } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/list.oa";
import { modifyDN } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/modifyDN.oa";
import { modifyEntry } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/modifyEntry.oa";
import { read } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/read.oa";
import { removeEntry } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/removeEntry.oa";
import { search } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/search.oa";
import emptyChainingResults from "../x500/emptyChainingResults";
import {
    EntryInformationSelection_infoTypes_attributeTypesOnly as typesOnly,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/EntryInformationSelection-infoTypes.ta";
import generateUnusedInvokeID from "./generateUnusedInvokeID";
import getCredentialsForNSAP from "./getCredentialsForNSAP";
import { naddrToURI } from "@wildboar/x500/src/lib/distributed/naddrToURI";
import {
    TLSResponse_success,
} from "@wildboar/x500/src/lib/modules/IDMProtocolSpecification/TLSResponse.ta";
import { flatten } from "flat";

const DEFAULT_CONNECTION_TIMEOUT_IN_SECONDS: number = 15 * 1000;
const DEFAULT_OPERATION_TIMEOUT_IN_SECONDS: number = 3600 * 1000;
const LDAP_VERSION_3: INTEGER = 3;

export
interface ConnectOptions {
    timeLimitInMilliseconds?: number;
    credentials?: DSACredentials,
    tlsOptional?: boolean;
}

/**
 * The general pattern behind this ordering is that we prefer security first,
 * so we attempt endpoints that are tunneled through TLS from start to finish.
 * Within protocols that do and do not tunnel within TLS, we prefer IDM(S), since
 * it is still fully-featured / X.500-based, but simplest, then ITOT(S), since it
 * is fully-featured, though more complicated, then LDAP(S) last, since some
 * directory information may not translate well between X.500 and LDAP systems.
 */
const protocolsByPreference: string[] = [
    "idms:",
    "itots:",
    "ldaps:",
    "idm:",
    "itot:",
    "ldap:",
];

const networkAddressPreference = (a: url.URL, b: url.URL): number => {
    const apref = protocolsByPreference.indexOf(a.protocol);
    const bpref = protocolsByPreference.indexOf(b.protocol);
    if (apref === -1) {
        return 1;
    }
    if (bpref === -1) {
        return -1;
    }
    return (apref - bpref);
};

/**
 * @summary Higher-order function for producing a `writeOperation` function from an IDM transport
 * @description
 *
 * This is a higher-order function that produces a `writeOperation` function
 * from an underlying IDM transport connnection.
 *
 * @param ctx The context object
 * @param idm The underlying IDM transport connection
 * @param targetSystem The target DSA
 * @returns A `writeOperation` function
 *
 * @function
 */
function getIDMOperationWriter (
    ctx: MeerkatContext,
    idm: IDMConnection,
    targetSystem: AccessPoint,
): Connection["writeOperation"] {
    return async function (req: ChainedRequest, options?: WriteOperationOptions): Promise<ChainedResultOrError> {
        const opstat: OperationStatistics = {
            type: "op",
            inbound: false,
            server: getServerStatistics(ctx),
            connection: {
                remoteAddress: idm.s.remoteAddress,
                remoteFamily: idm.s.remoteFamily,
                remotePort: idm.s.remotePort,
                transport: "IDMv2",
            },
            request: {
                operationCode: codeToString(req.opCode),
            },
            outcome: {},
        };
        const invokeID: number = generateUnusedInvokeID(ctx);
        const param: Chained = {
            unsigned: new Chained_ArgumentType_OPTIONALLY_PROTECTED_Parameter1(
                req.chaining,
                req.argument!,
            ),
        };
        const encodedParam = chainedRead.encoderFor["&ArgumentType"]!(param, DER);
        const ret = await Promise.race<ChainedResultOrError>([
            new Promise<ChainedResultOrError>((resolve) => {
                idm.events.on(invokeID.toString(), (roe: ResultOrError) => {
                    if ("error" in roe) {
                        resolve(roe);
                    } else {
                        const result = chainedRead.decoderFor["&ResultType"]!(roe.result!);
                        // TODO: Verify signature.
                        const resultData = getOptionallyProtectedValue(result);
                        resolve({
                            invokeId: {
                                present: invokeID,
                            },
                            opCode: req.opCode,
                            chaining: resultData.chainedResult,
                            result: resultData.result,
                        });
                    }
                });
                idm.writeRequest(
                    invokeID,
                    req.opCode,
                    encodedParam,
                );
            }),
            new Promise<never>((resolve, reject) => setTimeout(
                () => {
                    const err = new errors.ServiceError(
                        `DSA-initiated invocation ${invokeID.toString()} timed out.`,
                        new ServiceErrorData(
                            ServiceProblem_timeLimitExceeded,
                            [],
                            createSecurityParameters(
                                ctx,
                                targetSystem.ae_title.rdnSequence,
                                undefined,
                                serviceError["&errorCode"],
                            ),
                            ctx.dsa.accessPoint.ae_title.rdnSequence,
                            undefined,
                            undefined,
                        ),
                    );
                    reject(err);
                },
                (options?.timeLimitInMilliseconds ?? DEFAULT_OPERATION_TIMEOUT_IN_SECONDS),
            )),
        ]);
        if ("error" in ret) {
            opstat.outcome!.error = {
                code: ret.errcode
                    ? codeToString(ret.errcode)
                    : undefined,
            };
        } else {
            opstat.outcome!.result = {
                sizeInBytes: ret.result?.value.length,
            };
        }
        ctx.telemetry.trackEvent({
            name: "DistributedOperation",
            properties: {
                ...flatten(opstat),
            },
            measurements: {
                bytesRead: idm.socket.bytesRead,
                bytesWritten: idm.socket.bytesWritten,
            },
        });
        return ret;
    };
}

/**
 * @summary Higher-order function for producing a `writeOperation` function from an LDAP transport
 * @description
 *
 * This is a higher-order function that produces a `writeOperation` function
 * from an underlying LDAP transport connnection.
 *
 * @param ctx The context object
 * @param socket The underlying LDAP socket
 * @returns A `writeOperation` function
 *
 * @function
 */
function getLDAPOperationWriter (
    ctx: MeerkatContext,
    socket: LDAPSocket,
): Connection["writeOperation"] {
    return async (
        req: Omit<ChainedRequest, "invokeId">,
        options?: WriteOperationOptions,
    ): Promise<ChainedResultOrError> => {
        const opstat: OperationStatistics = {
            type: "op",
            inbound: false,
            server: getServerStatistics(ctx),
            connection: {
                remoteAddress: socket.socket.remoteAddress,
                remoteFamily: socket.socket.remoteFamily,
                remotePort: socket.socket.remotePort,
                transport: "TCP",
            },
            request: {
                operationCode: codeToString(req.opCode),
            },
            outcome: {},
        };
        const connectionTimeout: number = (
            options?.timeLimitInMilliseconds
            ?? DEFAULT_CONNECTION_TIMEOUT_IN_SECONDS
        );
        const invokeId = {
            present: 1, // This does not matter. It's just for type safety at this point.
        };
        const ldapRequest = dapRequestToLDAPRequest(ctx, {
            ...req,
            invokeId,
        });
        const result: ASN1Element = await Promise.race<ASN1Element>([
            new Promise<ASN1Element>((resolve, reject) => {
                const searchResults: SearchResultEntry[] = [];
                const searchRefs: SearchResultReference[] = [];
                // This listener cannot be .once(), because a message ID may be used multiple times
                // to return results for a search request.
                socket.on(ldapRequest.messageID.toString(), (message: LDAPMessage) => {
                    if (compareCode(req.opCode, addEntry["&operationCode"]!)) {
                        if (!("addResponse" in message.protocolOp)) {
                            reject(new Error());
                            return;
                        }
                        const result = ldapResponseToAddEntryResult(message.protocolOp.addResponse);
                        resolve(addEntry.encoderFor["&ResultType"]!(result, DER));
                        return;
                    }
                    else if (compareCode(req.opCode, compare["&operationCode"]!)) {
                        if (!("compareResponse" in message.protocolOp)) {
                            reject(new Error());
                            return;
                        }
                        const result = ldapResponseToCompareResult(ctx, message.protocolOp.compareResponse);
                        resolve(compare.encoderFor["&ResultType"]!(result, DER));
                        return;
                    }
                    else if (compareCode(req.opCode, list["&operationCode"]!)) {
                        if ("searchResEntry" in message.protocolOp) {
                            searchResults.push(message.protocolOp.searchResEntry);
                        } else if ("searchResRef" in message.protocolOp) {
                            searchRefs.push(message.protocolOp.searchResRef);
                        } else if ("searchResDone" in message.protocolOp) {
                            const result = ldapResponseToListResult(
                                ctx,
                                message.protocolOp.searchResDone,
                                searchResults,
                                searchRefs,
                            );
                            resolve(list.encoderFor["&ResultType"]!(result, DER));
                            return;
                        } else {
                            reject(new Error());
                            return;
                        }
                    }
                    else if (compareCode(req.opCode, modifyDN["&operationCode"]!)) {
                        if (!("modDNResponse" in message.protocolOp)) {
                            reject(new Error());
                            return;
                        }
                        const result = ldapResponseToModifyDNResult(message.protocolOp.modDNResponse);
                        resolve(modifyDN.encoderFor["&ResultType"]!(result, DER));
                        return;
                    }
                    else if (compareCode(req.opCode, modifyEntry["&operationCode"]!)) {
                        if (!("modifyResponse" in message.protocolOp)) {
                            reject(new Error());
                            return;
                        }
                        const result = ldapResponseToModifyEntryResult(message.protocolOp.modifyResponse);
                        resolve(modifyEntry.encoderFor["&ResultType"]!(result, DER));
                        return;
                    }
                    else if (compareCode(req.opCode, read["&operationCode"]!)) {
                        if ("searchResEntry" in message.protocolOp) {
                            searchResults.push(message.protocolOp.searchResEntry);
                        } else if ("searchResRef" in message.protocolOp) {
                            searchRefs.push(message.protocolOp.searchResRef);
                        } else if ("searchResDone" in message.protocolOp) {
                            if (searchResults.length !== 1) {
                                reject(new Error());
                                return;
                            }
                            const result = ldapResponseToReadResult(
                                ctx,
                                searchResults[0],
                                message.protocolOp.searchResDone,
                            );
                            resolve(read.encoderFor["&ResultType"]!(result, DER));
                            return;
                        } else {
                            reject(new Error());
                            return;
                        }
                    }
                    else if (compareCode(req.opCode, removeEntry["&operationCode"]!)) {
                        if (!("delResponse" in message.protocolOp)) {
                            reject(new Error());
                            return;
                        }
                        const result = ldapResponseToRemoveEntryResult(message.protocolOp.delResponse);
                        resolve(removeEntry.encoderFor["&ResultType"]!(result, DER));
                        return;
                    }
                    else if (compareCode(req.opCode, search["&operationCode"]!)) {
                        const arg = search.decoderFor["&ArgumentType"]!(req.argument!);
                        const data = getOptionallyProtectedValue(arg);
                        if ("searchResEntry" in message.protocolOp) {
                            searchResults.push(message.protocolOp.searchResEntry);
                        } else if ("searchResRef" in message.protocolOp) {
                            searchRefs.push(message.protocolOp.searchResRef);
                        } else if ("searchResDone" in message.protocolOp) {
                            const result = ldapResponseToSearchResult(
                                ctx,
                                (data.selection?.infoTypes === typesOnly),
                                message.protocolOp.searchResDone,
                                searchResults,
                                searchRefs,
                            );
                            resolve(search.encoderFor["&ResultType"]!(result, DER));
                            return;
                        } else {
                            reject(new Error());
                            return;
                        }
                    } else {
                        reject(new Error());
                        return;
                    }
                });
                socket.writeMessage(ldapRequest);
            }),
            new Promise<ASN1Element>((_, reject) => setTimeout(reject, connectionTimeout)),
        ]);
        ctx.telemetry.trackEvent({
            name: "DistributedOperation",
            properties: {
                ...flatten(opstat),
            },
            measurements: {
                bytesRead: socket.socket.bytesRead,
                bytesWritten: socket.socket.bytesWritten,
            },
        });
        return {
            invokeId,
            opCode: req.opCode,
            result,
            chaining: emptyChainingResults(),
        };
    }
}

/**
 * @summary Get LDAP `BindRequest`s from DSA credentials
 * @description
 *
 * This function converts DSA credentials into one or more LDAP `BindRequest`s
 * so that the credential, all variants of it, and an absence of it entirely,
 * may be tried for the purposes of chaining.
 *
 * @param ctx The context object
 * @param credentials DSA credentials to be translated to LDAP bind requests
 * @yields LDAP `BindRequest`s
 *
 * @function
 * @generator
 */
function *createBindRequests (
    ctx: Context,
    credentials?: DSACredentials,
): IterableIterator<BindRequest> {
    if (credentials && ("simple" in credentials)) {
        if (!credentials.simple.password) {
            yield new BindRequest(
                LDAP_VERSION_3,
                encodeLDAPDN(ctx, credentials.simple.name),
                {
                    simple: new Uint8Array(),
                },
            );
        } else if ("unprotected" in credentials.simple.password) {
            yield new BindRequest(
                LDAP_VERSION_3,
                encodeLDAPDN(ctx, credentials.simple.name),
                {
                    simple: credentials.simple.password.unprotected,
                },
            );
        } else if (
            ("userPwd" in credentials.simple.password)
            && ("clear" in credentials.simple.password.userPwd)
        ) {
            yield new BindRequest(
                LDAP_VERSION_3,
                encodeLDAPDN(ctx, credentials.simple.name),
                {
                    simple: Buffer.from(credentials.simple.password.userPwd.clear, "utf-8"),
                },
            );
        }
    }
    return new BindRequest(
        LDAP_VERSION_3,
        new Uint8Array(),
        {
            simple: new Uint8Array(),
        },
    );
}

/**
 * @summary Establish a connection to a remote LDAP server
 * @description
 *
 * This function attempts to establish a connection to a remote LDAP server,
 * possibly with multiple different credentials.
 *
 * @param ctx The context object
 * @param uri The URI of the remote LDAP server
 * @param credentials Array of DSA credentials to attempt, in order of
 *  decreasing preference
 * @param timeoutTime The time by which the operation must complete or abort
 * @param tlsRequired Whether TLS shall be required for this connection
 * @returns A connection, if one could be established, or `null` otherwise
 *
 * @function
 * @async
 */
async function connectToLDAP (
    ctx: MeerkatContext,
    uri: url.URL,
    credentials: DSACredentials[],
    timeoutTime: Date,
    tlsRequired: boolean,
): Promise<Connection | null> {
    const port: number = uri.port?.length
        ? Number.parseInt(uri.port)
        : 389;
    ctx.log.debug(ctx.i18n.t("log:trying_naddr", {
        uri,
    }), {
        dest: uri,
    });
    const getLDAPSocket = async (): Promise<LDAPSocket> => {
        const socket = net.createConnection({
            host: uri.hostname,
            port,
            timeout: differenceInMilliseconds(timeoutTime, new Date()),
        });
        const ldapSocket = new LDAPSocket(socket);
        await Promise.race<void>([
            new Promise<void>((resolve, reject) => {
                ldapSocket.on("connect", resolve);
                ldapSocket.on("error", reject);
                ldapSocket.on("timeout", reject);
                ldapSocket.on("close", reject);
            }),
            new Promise<void>((_, reject) => setTimeout(reject, differenceInMilliseconds(timeoutTime, new Date()))),
        ]);
        return ldapSocket;
    };
    let ldapSocket = await getLDAPSocket();
    for (const cred of credentials) {
        if (!("simple" in cred)) {
            continue;
        }
        if (!ldapSocket || !ldapSocket.socket.readable) {
            ldapSocket = await getLDAPSocket();
        }
        let connectionTimeRemaining = 0;
        let messageID: number = 0;
        for (const bindRequest of createBindRequests(ctx, cred)) {
            if (Date.now().valueOf() > timeoutTime.valueOf()) {
                ctx.log.debug(ctx.i18n.t("log:timed_out_connecting_to_naddr", {
                    uri,
                }), {
                    dest: uri,
                });
                return null;
            }
            messageID++;
            connectionTimeRemaining = differenceInMilliseconds(timeoutTime, new Date());
            try { // Bind
                await Promise.race<void>([
                    new Promise<void>((resolve, reject) => {
                        ldapSocket.once(messageID.toString(), (message: LDAPMessage) => {
                            assert(message.messageID === messageID);
                            if (
                                !("bindResponse" in message.protocolOp)
                                || (message.protocolOp.bindResponse.resultCode !== LDAPResult_resultCode_success)
                            ) {
                                reject();
                                return;
                            }
                            resolve();
                        });
                        const req = new LDAPMessage(
                            messageID,
                            {
                                bindRequest,
                            },
                            undefined,
                        );
                        ldapSocket.writeMessage(req);
                    }),
                    new Promise<void>((_, reject) => setTimeout(reject, connectionTimeRemaining)),
                ]);
            } catch {
                ctx.log.warn(ctx.i18n.t("log:error_naddr", {
                    uri,
                }), {
                    dest: uri,
                });
                continue;
            }
            ctx.log.info(ctx.i18n.t("log:bound_to_naddr", {
                uri,
            }), {
                dest: uri,
            });
            messageID++;
            connectionTimeRemaining = differenceInMilliseconds(timeoutTime, new Date());
            ctx.log.debug(ctx.i18n.t("log:attempting_starttls", {
                uri,
            }), {
                dest: uri,
            });
            try { // STARTTLS
                const req = new LDAPMessage(
                    messageID,
                    {
                        bindRequest,
                    },
                    undefined,
                );
                await Promise.race<void>([
                    new Promise<void>((resolve, reject) => {
                        ldapSocket.once(messageID.toString(), (message: LDAPMessage) => {
                            assert(message.messageID === messageID);
                            if (
                                !("extendedResp" in message.protocolOp)
                                || (message.protocolOp.extendedResp.resultCode !== LDAPResult_resultCode_success)
                            ) {
                                reject();
                                return;
                            } else {
                                const tlsSocket = new tls.TLSSocket(ldapSocket.socket);
                                ldapSocket.startTLS(tlsSocket);
                                tlsSocket.on("secureConnect", resolve);
                            }
                        });
                        ldapSocket.writeMessage(req);
                    }),
                    new Promise<void>((_, reject) => setTimeout(reject, connectionTimeRemaining)),
                ]);
                ctx.log.debug(ctx.i18n.t("log:established_starttls", {
                    uri,
                }), {
                    dest: uri,
                });
            } catch (e) {
                if (tlsRequired) {
                    ctx.log.debug(ctx.i18n.t("log:starttls_error", {
                        uri,
                        context: "tls_required",
                        e,
                    }), {
                        dest: uri,
                    });
                    continue;
                } else {
                    ctx.log.debug(ctx.i18n.t("log:starttls_error", {
                        uri,
                        context: "tls_optional",
                        e,
                    }));
                }
            }
            // If we made it here, one of our authentication attempts worked.
            const ret: Connection = {
                writeOperation: getLDAPOperationWriter(ctx, ldapSocket),
                close: async (): Promise<void> => {
                    ldapSocket.close();
                },
                events: new EventEmitter(),
            };
            return ret;
        }
    }
    return null;
}

// TODO: connectToLDAPS() (once connectToLDAP() has been tested)

/**
 * @summary Establish a connection to a remote IDM socket
 * @description
 *
 * This function attempts to establish a connection to a remote IDM socket,
 * possibly with multiple different credentials.
 *
 * @param ctx The context object
 * @param uri The URI of the remote DSA
 * @param idmGetter A function for getting a new IDM transport
 * @param targetSystem The target DSA's `AccessPoint`
 * @param protocolID The object identifier of the protocol with which to bind
 * @param credentials The set of DSA credentials to attempt, in order of
 *  decreasing preference
 * @param timeoutTime The time by which the operation must complete or abort
 * @param tlsRequired Whether TLS shall be required for this connection
 * @returns A connection, if one could be established, or `null` otherwise
 */
async function connectToIdmNaddr (
    ctx: MeerkatContext,
    uri: string,
    idmGetter: () => IDMConnection,
    targetSystem: AccessPoint,
    protocolID: OBJECT_IDENTIFIER,
    credentials: DSACredentials[],
    timeoutTime: Date,
    tlsRequired: boolean,
): Promise<Connection | null> {
    let idm: IDMConnection = idmGetter();
    // By adding `undefined` to the end of this array, we try one time without authentication.
    for (const cred of [ ...credentials, undefined ]) {
        if (Date.now().valueOf() > timeoutTime.valueOf()) {
            ctx.log.debug(ctx.i18n.t("log:timed_out_connecting_to_naddr", {
                uri,
            }), {
                dest: uri,
            });
            return null;
        }
        ctx.log.debug(ctx.i18n.t("log:trying_naddr", {
            uri,
        }), {
            dest: uri,
        });
        // If we got disconnected because of a bad bind, reconnect.
        // TODO: Make this configurable.
        if (!idm.s.readable) {
            idm = idmGetter();
        }
        try {
            await Promise.race([
                await new Promise((resolve, reject) => {
                    idm.events.once("bindError", (err) => {
                        reject(err.error);
                    });
                    idm.events.once("bindResult", (result) => {
                        resolve(result);
                    });
                    idm.writeBind(
                        protocolID,
                        _encode_DSABindArgument(new DSABindArgument(
                            cred,
                            undefined, // v1
                        ), DER),
                        {
                            directoryName: ctx.dsa.accessPoint.ae_title,
                        },
                        {
                            directoryName: targetSystem.ae_title,
                        },
                    );
                }),
                new Promise<void>((_, reject) => setTimeout(reject, differenceInMilliseconds(timeoutTime, new Date()))),
            ]);
            ctx.log.info(ctx.i18n.t("log:bound_to_naddr", {
                uri,
            }), {
                dest: uri,
            });
        } catch (e) {
            ctx.log.warn(ctx.i18n.t("log:error_naddr", {
                uri,
            }), {
                dest: uri,
            });
            continue;
        }

        ctx.log.debug(ctx.i18n.t("log:attempting_starttls", {
            uri,
        }), {
            dest: uri,
        });
        try { // STARTTLS
            await Promise.race([
                await new Promise<void>((resolve, reject) => {
                    idm.events.once("tLSResponse", (response) => {
                        if (response === TLSResponse_success) {
                            resolve();
                            return;
                        }
                        reject();
                    });
                    idm.writeStartTLS();
                }),
                new Promise<void>((_, reject) => setTimeout(reject, differenceInMilliseconds(timeoutTime, new Date()))),
            ]);
            ctx.log.debug(ctx.i18n.t("log:established_starttls", {
                uri,
            }), {
                dest: uri,
            });
        } catch (e) {
            if (tlsRequired) {
                ctx.log.debug(ctx.i18n.t("log:starttls_error", {
                    uri,
                    context: "tls_required",
                    e,
                }), {
                    dest: uri,
                });
                continue;
            } else {
                ctx.log.debug(ctx.i18n.t("log:starttls_error", {
                    uri,
                    context: "tls_optional",
                    e,
                }), {
                    dest: uri,
                });
            }
        }
    }

    const ret: Connection = {
        writeOperation: getIDMOperationWriter(ctx, idm, targetSystem),
        close: async (): Promise<void> => {
            idm.close();
        },
        events: new EventEmitter(),
    };
    const HANDLE_ERROR = () => {
        ret.events.emit("error", undefined);
    };
    idm.events.on("bindResult", () => {
        ret.events.emit("connect", undefined);
    });
    idm.events.on("bindError", () => {
        ret.events.emit("error", undefined);
    });
    idm.events.on("result", (result) => {
        ret.events.emit("response", [ result.opcode, result.result ]);
    });
    idm.events.on("error_", HANDLE_ERROR);
    idm.events.on("reject", HANDLE_ERROR);
    idm.events.on("abort", HANDLE_ERROR);
    return ret;
}

/**
 * @summary Establish a connection to a remote DSA
 * @description
 *
 * This function attempts to establish a connection to a remote DSA. This is the
 * foundation for subsequent distributed directory operations, such as
 * establishing hierarchical operational bindings. Such operations will use the
 * connection established through this function.
 *
 * @param ctx The context object
 * @param targetSystem The access point of the remote DSA to which a connection is sought
 * @param protocolID The object identifier of the protocol with which to bind
 * @param options Options
 * @returns A connection to the remote DSA, if one could be established, or `null` otherwise.
 *
 * @function
 * @async
 */
export
async function connect (
    ctx: MeerkatContext,
    targetSystem: AccessPoint,
    protocolID: OBJECT_IDENTIFIER,
    options?: ConnectOptions,
): Promise<Connection | null> {
    const connectionTimeout: number = (options?.timeLimitInMilliseconds ?? DEFAULT_CONNECTION_TIMEOUT_IN_SECONDS);
    const startTime = new Date();
    const timeoutTime = addMilliseconds(startTime, connectionTimeout);
    const networkAddressesOrderedByPreference: url.URL[] = targetSystem.address.nAddresses
        .map(naddrToURI)
        .filter((ustr: string | undefined): ustr is string => !!ustr)
        .map((ustr) => new url.URL(ustr))
        .sort(networkAddressPreference);
    for (const uri of networkAddressesOrderedByPreference) {
        if ((new Date()) > timeoutTime) {
            return null;
        }
        ctx.telemetry.trackEvent({
            name: "DistributedOperation",
            properties: {
                ...flatten({
                    server: getServerStatistics(this.ctx),
                }),
                ...flatten({
                    nsap: {
                        uri: uri.toString(),
                        protocol: uri.protocol,
                        host: uri.hostname,
                        port: uri.port,
                        path: uri.pathname,
                        query: uri.search,
                        fragment: uri.hash,
                    },
                }),
                timeoutTime: timeoutTime.toString(),
                inbound: false,
                "bind.protocol": protocolID.toString(),
                tlsOptional: options?.tlsOptional,
            },
        });
        const connectionTimeRemaining = differenceInMilliseconds(timeoutTime, new Date());
        const credentials: DSACredentials[] = await getCredentialsForNSAP(ctx, uri.toString());
        if (uri.protocol.toLowerCase().startsWith("idm:")) { // TODO: Handle IDMS
            if (!uri.port) {
                continue;
            }
            return connectToIdmNaddr(
                ctx,
                uri.toString(),
                () => {
                    const socket = net.createConnection({
                        host: uri.hostname,
                        port: Number.parseInt(uri.port),
                        timeout: connectionTimeRemaining,
                    });
                    // Credit to: https://github.com/nodejs/node/issues/5757#issuecomment-305969057
                    socket.once("connect", () => socket.setTimeout(0));
                    return new IDMConnection(socket);
                },
                targetSystem,
                protocolID,
                credentials,
                timeoutTime,
                !options?.tlsOptional,
            );
        } else if (uri.protocol.toLowerCase() === "ldap") {
            return connectToLDAP(ctx, uri, credentials, timeoutTime, !options?.tlsOptional);
        } if (uri.protocol.toLowerCase() === "ldaps") {
            return null; // TODO: Support LDAPS
        }
        // No other address types are supported.
    }
    return null;
}

export default connect;
