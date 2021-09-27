import { Context, Vertex, ClientConnection } from "../types";
import * as net from "net";
import * as tls from "tls";
import { BERElement, ASN1TruncationError, ObjectIdentifier } from "asn1-ts";
import { BER } from "asn1-ts/dist/node/functional";
import {
    LDAPMessage,
    _decode_LDAPMessage,
    _encode_LDAPMessage,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPMessage.ta";
import {
    LDAPResult,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPResult.ta";
import {
    BindResponse,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/BindResponse.ta";
import {
    SearchResultEntry,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/SearchResultEntry.ta";
import {
    ExtendedResponse,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/ExtendedResponse.ta";
import {
    LDAPResult_resultCode_success,
    LDAPResult_resultCode_protocolError,
    LDAPResult_resultCode_other,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPResult.ta";
import {
    AuthenticationLevel_basicLevels,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/AuthenticationLevel-basicLevels.ta";
import {
    AuthenticationLevel_basicLevels_level_none,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/AuthenticationLevel-basicLevels-level.ta";
import { startTLS } from "@wildboar/ldap/src/lib/extensions";
import bind from "./bind";
import decodeLDAPOID from "@wildboar/ldap/src/lib/decodeLDAPOID";
import encodeLDAPOID from "@wildboar/ldap/src/lib/encodeLDAPOID";
import ldapRequestToDAPRequest from "../distributed/ldapRequestToDAPRequest";
import dapReplyToLDAPResult from "../distributed/dapReplyToLDAPResult";
import OperationDispatcher from "../distributed/OperationDispatcher";
import dapErrorToLDAPResult from "../distributed/dapErrorToLDAPResult";
import getOptionallyProtectedValue from "@wildboar/x500/src/lib/utils/getOptionallyProtectedValue";

async function handleRequest (
    ctx: Context,
    conn: ClientConnection, // eslint-disable-line
    message: LDAPMessage,
    // stats: OperationStatistics,
): Promise<void> {
    const dapRequest = ldapRequestToDAPRequest(ctx, message);
    const result = await OperationDispatcher.dispatchDAPRequest(
        ctx,
        conn,
        {
            invokeId: dapRequest.invokeId,
            opCode: dapRequest.opCode,
            argument: dapRequest.argument,
        },
    );
    // let toWriteBuffer: Buffer = Buffer.alloc(0);
    // let resultsBuffered: number = 0;
    const onEntry = async (searchResEntry: SearchResultEntry): Promise<void> => {
        const resultMessage = new LDAPMessage(
            message.messageID,
            {
                searchResEntry,
            },
            undefined,
        );
        // resultsBuffered++;
        // toWriteBuffer = Buffer.concat([
        //     toWriteBuffer,
        //     _encode_LDAPMessage(resultMessage, BER).toBytes(),
        // ]);
        // if (resultsBuffered >= 100) {
        //     conn.socket.write(toWriteBuffer);
        //     toWriteBuffer = Buffer.alloc(0);
        // }
        // if (searchResEntry.objectName.length === 0) {
        // console.log(searchResEntry.objectName);
        // }
        conn.socket.write(_encode_LDAPMessage(resultMessage, BER).toBytes());
    };
    const unprotectedResult = getOptionallyProtectedValue(result.result);
    const ldapResult = await dapReplyToLDAPResult(ctx, {
        invokeId: dapRequest.invokeId, // TODO: I think this is unnecessary.
        opCode: dapRequest.opCode,
        result: unprotectedResult.result,
    }, message.messageID, onEntry);
    conn.socket.write(_encode_LDAPMessage(ldapResult, BER).toBytes());
    // stats.request = result.request ?? stats.request;
    // stats.outcome = result.outcome ?? stats.outcome;
    // ctx.statistics.operations.push(stats);
}

async function handleRequestAndErrors (
    ctx: Context,
    conn: ClientConnection, // eslint-disable-line
    message: LDAPMessage,
): Promise<void> {
    // const stats: OperationStatistics = {
    //     type: "op",
    //     inbound: true,
    //     server: getServerStatistics(),
    //     connection: getConnectionStatistics(dap),
    //     // idm?: IDMTransportStatistics;
    //     bind: {
    //         protocol: dap_ip["&id"]!.toString(),
    //     },
    //     request: {
    //         operationCode: codeToString(request.opcode),
    //     },
    // };
    // const now = new Date();
    // dap.invocations.set(request.invokeID, {
    //     invokeId: request.invokeID,
    //     operationCode: request.opcode,
    //     startTime: new Date(),
    // });
    try {
        await handleRequest(ctx, conn, message);
    } catch (e) {
        console.log(e);
        const result: LDAPResult | undefined = dapErrorToLDAPResult(e);
        if (!result) {
            return; // No response is returned for abandoned operations in LDAP.
        }
        if ("addRequest" in message.protocolOp) {
            const res = new LDAPMessage(message.messageID, { addResponse: result }, undefined);
            conn.socket.write(_encode_LDAPMessage(res, BER).toBytes());
        } else if ("compareRequest" in message.protocolOp) {
            const res = new LDAPMessage(message.messageID, { compareResponse: result }, undefined);
            conn.socket.write(_encode_LDAPMessage(res, BER).toBytes());
        } else if ("delRequest" in message.protocolOp) {
            const res = new LDAPMessage(message.messageID, { delResponse: result }, undefined);
            conn.socket.write(_encode_LDAPMessage(res, BER).toBytes());
        } else if ("modDNRequest" in message.protocolOp) {
            const res = new LDAPMessage(message.messageID, { modDNResponse: result }, undefined);
            conn.socket.write(_encode_LDAPMessage(res, BER).toBytes());
        } else if ("modifyRequest" in message.protocolOp) {
            const res = new LDAPMessage(message.messageID, { modifyResponse: result }, undefined);
            conn.socket.write(_encode_LDAPMessage(res, BER).toBytes());
        } else if ("searchRequest" in message.protocolOp) {
            const res = new LDAPMessage(message.messageID, { searchResDone: result }, undefined);
            conn.socket.write(_encode_LDAPMessage(res, BER).toBytes());
        } else {
            return;
        }
        // if (!stats.outcome) {
        //     stats.outcome = {};
        // }
        // if (!stats.outcome.error) {
        //     stats.outcome.error = {};
        // }
        // if (e instanceof Error) {
        //     stats.outcome.error.stack = e.stack;
        // }
        // if (e instanceof errors.DirectoryError) {
        //     stats.outcome.error.code = codeToString(e.getErrCode());
        // }
    } finally {
        // dap.invocations.set(request.invokeID, {
        //     invokeId: request.invokeID,
        //     operationCode: request.opcode,
        //     startTime: now,
        //     resultTime: new Date(),
        // });
        // for (const opstat of ctx.statistics.operations) {
        //     ctx.telemetry.sendEvent(opstat);
        // }
    }
}

export
class LDAPConnection extends ClientConnection {

    private buffer: Buffer = Buffer.alloc(0);
    public boundEntry: Vertex | undefined;

    private handleData (ctx: Context, data: Buffer): void {
        this.buffer = Buffer.concat([
            this.buffer,
            data,
        ]);

        while (this.buffer.length > 0) {
            const el = new BERElement();
            let bytesRead = 0;
            try {
                bytesRead = el.fromBytes(this.buffer);
            } catch (e) {
                if (e instanceof ASN1TruncationError) {
                    return;
                }
                console.error(e);
                // TODO: Close the connection.
                return;
            }
            let message!: LDAPMessage;
            try {
                message = _decode_LDAPMessage(el);
            } catch (e) {
                console.error(e);
                console.error(`Malformed LDAPMessage. ${this.buffer.toString("hex")}`);
                return;
            }

            if ("bindRequest" in message.protocolOp) {
                const req = message.protocolOp.bindRequest;
                bind(ctx, this.socket, req)
                    .then(async (bindReturn) => {
                        if (bindReturn.result.resultCode === LDAPResult_resultCode_success) {
                            this.boundEntry = bindReturn.boundVertex;
                            this.authLevel = bindReturn.authLevel;
                        }
                        const res = new LDAPMessage(
                            message.messageID,
                            {
                                bindResponse: bindReturn.result,
                            },
                            undefined,
                        );
                        this.socket.write(_encode_LDAPMessage(res, BER).toBytes());
                    })
                    .catch((e) => {
                        ctx.log.error(e);
                        const res = new LDAPMessage(
                            message.messageID,
                            {
                                bindResponse: new BindResponse(
                                    LDAPResult_resultCode_other,
                                    new Uint8Array(),
                                    Buffer.alloc(0),
                                    undefined,
                                    undefined,
                                ),
                            },
                            undefined,
                        );
                        this.socket.write(_encode_LDAPMessage(res, BER).toBytes());
                    });
            } else if ("unbindRequest" in message.protocolOp) {
                this.boundEntry = undefined;
                this.authLevel = {
                    basicLevels: new AuthenticationLevel_basicLevels(
                        AuthenticationLevel_basicLevels_level_none,
                        0,
                        false,
                    ),
                };
            } else if ("abandonRequest" in message.protocolOp) {
                console.log(`Abandon operation ${message.protocolOp.abandonRequest}`);
            } else if ("extendedReq" in message.protocolOp) {
                const req = message.protocolOp.extendedReq;
                const oid = decodeLDAPOID(req.requestName);
                if (oid.isEqualTo(startTLS)) {
                    this.socket.removeAllListeners("data");
                    this.buffer = Buffer.alloc(0);
                    this.socket = new tls.TLSSocket(this.socket);
                    const res = new LDAPMessage(
                        message.messageID,
                        {
                            extendedResp: new ExtendedResponse(
                                LDAPResult_resultCode_success,
                                Buffer.alloc(0),
                                Buffer.from("STARTTLS initiated.", "utf-8"),
                                undefined,
                                encodeLDAPOID(new ObjectIdentifier([ 1, 3, 6, 1, 4, 1, 1466, 20037 ])),
                                undefined,
                            ),
                        },
                        undefined,
                    );
                    this.socket.write(_encode_LDAPMessage(res, BER).toBytes());
                } else {
                    const res = new LDAPMessage(
                        message.messageID,
                        {
                            extendedResp: new ExtendedResponse(
                                LDAPResult_resultCode_protocolError,
                                Buffer.alloc(0),
                                Buffer.from("Extended operation not understood.", "utf-8"),
                                undefined,
                                undefined,
                                undefined,
                            ),
                        },
                        undefined,
                    );
                    this.socket.write(_encode_LDAPMessage(res, BER).toBytes());
                }
            } else {
                // Intentional NO_AWAIT
                // If you await this, it will cause a race condition.
                // Specifically, this.buffer will be indeterminate.
                handleRequestAndErrors(ctx, this, message);
            }
            this.buffer = this.buffer.slice(bytesRead);
        }
    }

    constructor (
        readonly ctx: Context,
        readonly tcp: net.Socket,
    ) {
        super();
        this.socket = tcp;
        this.socket.on("data", (data: Buffer): void => {
            this.handleData(ctx, data);
        });
        this.socket.on("error", () => console.log("SOCKET ERROR"));
        this.socket.on("drain", () => console.log("SOCKET DRAIN"));
    }

}

export default LDAPConnection;
