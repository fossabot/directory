import type { Context, Vertex } from "@wildboar/meerkat-types";
import type { INTEGER } from "asn1-ts";
import type { Result } from "@wildboar/x500/src/lib/types/Result";
import { LDAPMessage } from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPMessage.ta";
import compareCode from "@wildboar/x500/src/lib/utils/compareCode";
// import { administerPassword } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/administerPassword.oa";
import { addEntry } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/addEntry.oa";
// import { changePassword } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/changePassword.oa";
import { compare } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/compare.oa";
// import { list } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/list.oa";
import { modifyDN } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/modifyDN.oa";
import { modifyEntry } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/modifyEntry.oa";
import { read } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/read.oa";
import { removeEntry } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/removeEntry.oa";
import { search } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/search.oa";
import {
    LDAPResult,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPResult.ta";
import {
    LDAPResult_resultCode_success,
    LDAPResult_resultCode_compareTrue,
    LDAPResult_resultCode_compareFalse,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPResult-resultCode.ta";
import {
    SearchResultEntry,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/SearchResultEntry.ta";
import getOptionallyProtectedValue from "@wildboar/x500/src/lib/utils/getOptionallyProtectedValue";
import getDistinguishedName from "../x500/getDistinguishedName";
import encodeLDAPDN from "../ldap/encodeLDAPDN";
import {
    PartialAttribute,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/PartialAttribute.ta";
import type {
    SearchResult,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SearchResult.ta";
import type {
    LDAPDN,
} from "@wildboar/ldap/src/lib/modules/Lightweight-Directory-Access-Protocol-V3/LDAPDN.ta";
import getPartialAttributesFromEntryInformation from "../ldap/getPartialAttributesFromEntryInformation";

async function getSearchResultEntries (
    ctx: Context,
    searchResult: SearchResult,
    onEntry: (entry: SearchResultEntry) => Promise<void>,
): Promise<void> {
    const data = getOptionallyProtectedValue(searchResult);
    if ("searchInfo" in data) {
        for (const einfo of data.searchInfo.entries) {
            const dn: LDAPDN = encodeLDAPDN(ctx, einfo.name.rdnSequence);
            const attrs: PartialAttribute[] = getPartialAttributesFromEntryInformation(ctx, einfo.information ?? []);
            const entry = new SearchResultEntry(
                dn,
                attrs,
            );
            await onEntry(entry);
        }
    } else if ("uncorrelatedSearchInfo" in data) {
        for (const resultSet of data.uncorrelatedSearchInfo) {
            await getSearchResultEntries(ctx, resultSet, onEntry);
        }
    }
}

/**
 * This procedure is not specified in the X.500 series, but can be inferred from
 * ITU X.518 (2016), Section 20.7.
 *
 * @param ctx
 * @param res
 * @param messageId
 * @param onEntry
 * @param foundDSE
 * @returns
 */
export
async function dapReplyToLDAPResult (
    ctx: Context,
    res: Result,
    messageId: INTEGER,
    onEntry: (entry: SearchResultEntry) => Promise<void>,
    foundDSE?: Vertex,
): Promise<LDAPMessage> {
    if (!res.opCode || !res.result) {
        throw new Error(); // FIXME:
    }
    const foundDN: LDAPDN = foundDSE // TODO: Make empty if it matches the target object.
        ? encodeLDAPDN(ctx, getDistinguishedName(foundDSE))
        : new Uint8Array();
    if (compareCode(res.opCode, addEntry["&operationCode"]!)) {
        return new LDAPMessage(
            messageId,
            {
                addResponse: new LDAPResult(
                    LDAPResult_resultCode_success,
                    foundDN,
                    Buffer.from("Success", "utf-8"),
                    undefined,
                ),
            },
            undefined,
        );
    }
    if (compareCode(res.opCode, compare["&operationCode"]!)) {
        const result = compare.decoderFor["&ResultType"]!(res.result!);
        const data = getOptionallyProtectedValue(result);
        return new LDAPMessage(
            messageId,
            {
                compareResponse: new LDAPResult(
                    data.matched
                        ? LDAPResult_resultCode_compareTrue
                        : LDAPResult_resultCode_compareFalse,
                    foundDN,
                    Buffer.from("Success", "utf-8"),
                    undefined,
                ),
            },
            undefined,
        );
    }
    if (compareCode(res.opCode, modifyDN["&operationCode"]!)) {
        return new LDAPMessage(
            messageId,
            {
                modDNResponse: new LDAPResult(
                    LDAPResult_resultCode_success,
                    foundDN,
                    Buffer.from("Success", "utf-8"),
                    undefined,
                ),
            },
            undefined,
        );
    }
    if (compareCode(res.opCode, modifyEntry["&operationCode"]!)) {
        return new LDAPMessage(
            messageId,
            {
                modifyResponse: new LDAPResult(
                    LDAPResult_resultCode_success,
                    foundDN,
                    Buffer.from("Success", "utf-8"),
                    undefined,
                ),
            },
            undefined,
        );
    }
    if (compareCode(res.opCode, read["&operationCode"]!)) {
        const result = read.decoderFor["&ResultType"]!(res.result!);
        const data = getOptionallyProtectedValue(result);
        const attrs: PartialAttribute[] = getPartialAttributesFromEntryInformation(ctx, data.entry.information ?? []);
        const entry = new SearchResultEntry(
            foundDN,
            attrs,
        );
        await onEntry(entry);
        return new LDAPMessage(
            messageId,
            {
                searchResDone: new LDAPResult(
                    LDAPResult_resultCode_success,
                    foundDN,
                    Buffer.from("Success", "utf-8"),
                    undefined,
                ),
            },
            undefined,
        );
    }
    if (compareCode(res.opCode, removeEntry["&operationCode"]!)) {
        return new LDAPMessage(
            messageId,
            {
                delResponse: new LDAPResult(
                    LDAPResult_resultCode_success,
                    foundDN,
                    Buffer.from("Success", "utf-8"),
                    undefined,
                ),
            },
            undefined,
        );
    }
    if (compareCode(res.opCode, search["&operationCode"]!)) {
        const result = search.decoderFor["&ResultType"]!(res.result!);
        await getSearchResultEntries(ctx, result, onEntry);
        return new LDAPMessage(
            messageId,
            {
                searchResDone: new LDAPResult(
                    LDAPResult_resultCode_success,
                    foundDN,
                    Buffer.from("Success", "utf-8"),
                    undefined,
                ),
            },
            undefined,
        );
    } else {
        throw new Error();
    }
}

export default dapReplyToLDAPResult;
