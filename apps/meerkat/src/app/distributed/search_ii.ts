import type { ClientAssociation, PagedResultsRequestState } from "@wildboar/meerkat-types";
import * as errors from "@wildboar/meerkat-types";
import type { MeerkatContext } from "../ctx";
import { TRUE_BIT, TRUE } from "asn1-ts";
import * as crypto from "crypto";
import {
    SearchArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SearchArgument.ta";
import {
    SearchArgumentData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SearchArgumentData.ta";
import {
    SearchArgumentData_subset_oneLevel,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SearchArgumentData-subset.ta";
import {
    ServiceControlOptions_dontUseCopy,
    ServiceControlOptions_copyShallDo,
    ServiceControlOptions_chainingProhibited as chainingProhibitedBit,
    ServiceControlOptions_manageDSAIT as manageDSAITBit,
    ServiceControlOptions_preferChaining as preferChainingBit,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceControlOptions.ta";
import {
    ChainingArguments,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/ChainingArguments.ta";
import {
    AbandonedData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AbandonedData.ta";
import readSubordinates from "../dit/readSubordinates";
import getOptionallyProtectedValue from "@wildboar/x500/src/lib/utils/getOptionallyProtectedValue";
import checkSuitabilityProcedure from "./checkSuitability";
import createSecurityParameters from "../x500/createSecurityParameters";
import {
    abandoned,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/abandoned.oa";
import {
    search,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/search.oa";
import search_i, { SearchState } from "./search_i";
import type { OperationDispatcherState } from "./OperationDispatcher";
import {
    ServiceErrorData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceErrorData.ta";
import {
    id_errcode_serviceError,
} from "@wildboar/x500/src/lib/modules/CommonProtocolSpecification/id-errcode-serviceError.va";
import {
    ServiceProblem_invalidQueryReference,
    ServiceProblem_unwillingToPerform,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceProblem.ta";
import {
    AbandonedProblem_pagingAbandoned,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AbandonedProblem.ta";
import {
    ProtectionRequest_signed,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ProtectionRequest.ta";
import { id_ar_autonomousArea } from "@wildboar/x500/src/lib/modules/InformationFramework/id-ar-autonomousArea.va";

const BYTES_IN_A_UUID: number = 16;

/**
 * "Why don't you just fetch `pageSize` number of entries?"
 *
 * Pagination fetches `pageSize` number of entries at _each level_ of search
 * recursion. In other words, if you request a page size of 100, and, in the
 * process, you recurse into the DIT ten layers deep, there will actually be
 * 1000 entries loaded into memory at the deepest part. This means that a
 * request could consume considerably higher memory than expected. To prevent
 * this, a fixed page size is used. In the future, this may be configurable.
 */
const ENTRIES_PER_BATCH: number = 1000;
const AUTONOMOUS: string = id_ar_autonomousArea.toString();

/**
 * @summary The Search (II) Procedure, as specified in ITU Recommendation X.518.
 * @description
 *
 * The `search` operation, as specified in ITU Recommendation X.511 (2016),
 * Section 11.2, per the recommended implementation of the Search (II) procedure
 * defined in in ITU Recommendation X.518 (2016), Section 19.3.2.2.6.
 *
 * @param ctx The context object
 * @param assn The client association
 * @param state The operation dispatcher state
 * @param argument The original SearchArgument
 * @param searchState The current search state
 *
 * @function
 * @async
 */
export
async function search_ii (
    ctx: MeerkatContext,
    assn: ClientAssociation,
    state: OperationDispatcherState,
    argument: SearchArgument,
    searchState: SearchState,
): Promise<void> {
    const target = state.foundDSE;
    const data = getOptionallyProtectedValue(argument);
    const chainingProhibited = (
        (data.serviceControls?.options?.[chainingProhibitedBit] === TRUE_BIT)
        || (data.serviceControls?.options?.[manageDSAITBit] === TRUE_BIT)
    );
    const preferChaining: boolean = (data.serviceControls?.options?.[preferChainingBit] === TRUE_BIT);
    if (
        data.pagedResults
        && (data.securityParameters?.target === ProtectionRequest_signed)
        && (!chainingProhibited || preferChaining)
    ) {
        throw new errors.ServiceError(
            ctx.i18n.t("err:cannot_use_pagination_and_signing"),
            new ServiceErrorData(
                ServiceProblem_unwillingToPerform,
                [],
                createSecurityParameters(
                    ctx,
                    assn.boundNameAndUID?.dn,
                    undefined,
                    id_errcode_serviceError,
                ),
                ctx.dsa.accessPoint.ae_title.rdnSequence,
                state.chainingArguments.aliasDereferenced,
                undefined,
            ),
        );
    }
    const op = ("present" in state.invokeId)
        ? assn.invocations.get(Number(state.invokeId.present))
        : undefined;
    const subset = data.subset ?? SearchArgumentData._default_value_for_subset;
    const serviceControlOptions = data.serviceControls?.options;
    const dontUseCopy: boolean = (serviceControlOptions?.[ServiceControlOptions_dontUseCopy] === TRUE_BIT);
    const copyShallDo: boolean = (serviceControlOptions?.[ServiceControlOptions_copyShallDo] === TRUE_BIT);

    /**
     * NOTE: Joins are going to be ENTIRELY UNSUPPORTED, because many details
     * are unspecified:
     *
     * - The `relatedEntry` attribute that joining depends on is _undefined_ by any ITU specification.
     * - ~~It is not clear what `JoinArgument.domainLocalID` even is, nor how to handle if it is not understood.~~
     *   - I rescined this statement^. `domainLocalID` is defined in X.518.
     *   - However, it is still undefined what to do if it is not recognized.
     *
     * If this is ever implemented, the code below will also need to perform
     * pagination before joining. The code below is _extremely unscalable_.
     * Because every entry has to be compared against every other entry
     * (and indexing attribute values generally is not viable), the compute
     * time will grow a O(n^2) or even worse time (because all attributes of
     * each entry must be compared, and the same for all values of said
     * attributes.) This is so unscalable, I had doubts about implementing it
     * in the first place.
     *
     * Also, if the code below is ever implemented, another deduplication may be
     * necessary, because the additional entries brought in by the joins may
     * overlap. On the other hand, maybe it's fine to allow the user to do this?
     *
     * For now, if a join is attempted, the server should just return an
     * unwillingToPerform error.
     */
    if (data.joinArguments) {
        throw new errors.ServiceError(
            ctx.i18n.t("err:joins_unsupported"),
            new ServiceErrorData(
                ServiceProblem_unwillingToPerform,
                [],
                createSecurityParameters(
                    ctx,
                    assn.boundNameAndUID?.dn,
                    undefined,
                    id_errcode_serviceError,
                ),
                ctx.dsa.accessPoint.ae_title.rdnSequence,
                state.chainingArguments.aliasDereferenced,
                undefined,
            ),
        );
    }

    let cursorId: number | undefined = searchState.paging?.[1].cursorIds[searchState.depth];
    if (!searchState.depth && data.pagedResults) { // This should only be done for the first recursion.
        if ("newRequest" in data.pagedResults) {
            const nr = data.pagedResults.newRequest;
            const pi = (((nr.pageNumber !== undefined) ? Number(nr.pageNumber) : 1) - 1); // The spec is unclear if this is zero-indexed.
            if ((pi < 0) || !Number.isSafeInteger(pi)) {
                throw new errors.ServiceError(
                    ctx.i18n.t("err:page_number_invalid", {
                        pi,
                    }),
                    new ServiceErrorData(
                        ServiceProblem_invalidQueryReference,
                        [],
                        createSecurityParameters(
                            ctx,
                            assn.boundNameAndUID?.dn,
                            undefined,
                            id_errcode_serviceError,
                        ),
                        ctx.dsa.accessPoint.ae_title.rdnSequence,
                        state.chainingArguments.aliasDereferenced,
                        undefined,
                    ),
                );
            }
            // pageSize = 0 is a problem because we push entry to results before checking if we have a full page.
            if ((nr.pageSize < 1) || !Number.isSafeInteger(nr.pageSize)) {
                throw new errors.ServiceError(
                    ctx.i18n.t("err:page_size_invalid", {
                        ps: nr.pageSize,
                    }),
                    new ServiceErrorData(
                        ServiceProblem_invalidQueryReference,
                        [],
                        createSecurityParameters(
                            ctx,
                            assn.boundNameAndUID?.dn,
                            undefined,
                            id_errcode_serviceError,
                        ),
                        ctx.dsa.accessPoint.ae_title.rdnSequence,
                        state.chainingArguments.aliasDereferenced,
                        undefined,
                    ),
                );
            }
            if (nr.sortKeys?.length) {
                const uniqueSortKeys = new Set(nr.sortKeys.map((sk) => sk.type_.toString()));
                if (uniqueSortKeys.size < nr.sortKeys.length) {
                    throw new errors.ServiceError(
                        ctx.i18n.t("err:duplicate_sort_key", {
                            ps: nr.pageSize,
                        }),
                        new ServiceErrorData(
                            ServiceProblem_unwillingToPerform,
                            [],
                            createSecurityParameters(
                                ctx,
                                assn.boundNameAndUID?.dn,
                                undefined,
                                id_errcode_serviceError,
                            ),
                            ctx.dsa.accessPoint.ae_title.rdnSequence,
                            state.chainingArguments.aliasDereferenced,
                            undefined,
                        ),
                    );
                }
                if (nr.sortKeys.length > 3) {
                    ctx.log.warn(ctx.i18n.t("log:too_many_sort_keys", {
                        aid: assn.id,
                        num: nr.sortKeys.length,
                    }), {
                        remoteFamily: assn.socket.remoteFamily,
                        remoteAddress: assn.socket.remoteAddress,
                        remotePort: assn.socket.remotePort,
                        association_id: assn.id,
                    });
                    nr.sortKeys.length = 3;
                }
            }
            const queryReference: string = crypto.randomBytes(BYTES_IN_A_UUID).toString("base64");
            const newPagingState: PagedResultsRequestState = {
                cursorIds: [],
                request: data.pagedResults.newRequest,
                alreadyReturnedById: new Set(),
            };
            searchState.paging = [ queryReference, newPagingState ];
            if (assn.pagedResultsRequests.size >= 5) {
                assn.pagedResultsRequests.clear();
            }
            assn.pagedResultsRequests.set(queryReference, newPagingState);
        } else if ("queryReference" in data.pagedResults) {
            const queryReference: string = Buffer.from(data.pagedResults.queryReference).toString("base64");
            const paging = assn.pagedResultsRequests.get(queryReference);
            if (!paging) {
                throw new errors.ServiceError(
                    ctx.i18n.t("err:paginated_query_ref_invalid"),
                    new ServiceErrorData(
                        ServiceProblem_invalidQueryReference,
                        [],
                        createSecurityParameters(
                            ctx,
                            assn.boundNameAndUID?.dn,
                            undefined,
                            id_errcode_serviceError,
                        ),
                        ctx.dsa.accessPoint.ae_title.rdnSequence,
                        state.chainingArguments.aliasDereferenced,
                        undefined,
                    ),
                );
            }
            searchState.paging = [ queryReference, paging ];
            cursorId = searchState.paging[1].cursorIds[searchState.depth];
        } else if ("abandonQuery" in data.pagedResults) {
            const queryReference: string = Buffer.from(data.pagedResults.abandonQuery).toString("base64");
            assn.pagedResultsRequests.delete(queryReference);
            throw new errors.AbandonError(
                ctx.i18n.t("err:abandoned_paginated_query"),
                new AbandonedData(
                    AbandonedProblem_pagingAbandoned,
                    [],
                    createSecurityParameters(
                        ctx,
                        assn.boundNameAndUID?.dn,
                        undefined,
                        abandoned["&errorCode"],
                    ),
                    ctx.dsa.accessPoint.ae_title.rdnSequence,
                    state.chainingArguments.aliasDereferenced,
                    undefined,
                ),
            );
        } else {
            throw new errors.ServiceError(
                ctx.i18n.t("err:unrecognized_paginated_query_syntax"),
                new ServiceErrorData(
                    ServiceProblem_unwillingToPerform,
                    [],
                    createSecurityParameters(
                        ctx,
                        assn.boundNameAndUID?.dn,
                        undefined,
                        id_errcode_serviceError,
                    ),
                    ctx.dsa.accessPoint.ae_title.rdnSequence,
                    state.chainingArguments.aliasDereferenced,
                    undefined,
                ),
            );
        }
    }

    let subordinatesInBatch = await readSubordinates(
        ctx,
        target,
        ENTRIES_PER_BATCH,
        undefined,
        cursorId,
    );
    while (subordinatesInBatch.length) {
        for (const subordinate of subordinatesInBatch) {
            cursorId = subordinate.dse.id;
            if (op?.abandonTime) {
                op.events.emit("abandon");
                throw new errors.AbandonError(
                    ctx.i18n.t("err:abandoned"),
                    new AbandonedData(
                        undefined,
                        [],
                        createSecurityParameters(
                            ctx,
                            assn.boundNameAndUID?.dn,
                            undefined,
                            abandoned["&errorCode"],
                        ),
                        ctx.dsa.accessPoint.ae_title.rdnSequence,
                        state.chainingArguments.aliasDereferenced,
                        undefined,
                    ),
                );
            }
            if (!subordinate.dse.cp) {
                continue;
            }
            const suitable: boolean = await checkSuitabilityProcedure(
                ctx,
                assn,
                subordinate,
                search["&operationCode"]!,
                state.chainingArguments.aliasDereferenced ?? ChainingArguments._default_value_for_aliasDereferenced,
                data.criticalExtensions ?? new Uint8ClampedArray(),
                dontUseCopy,
                copyShallDo,
                state.chainingArguments.excludeShadows ?? ChainingArguments._default_value_for_excludeShadows,
                undefined,
                argument,
            );
            if (!suitable) {
                continue;
            }
            const newArgument: SearchArgument = (
                (subset !== SearchArgumentData_subset_oneLevel)
                && (target.dse.alias)
            )
                ? argument
                : {
                    unsigned: new SearchArgumentData(
                        data.baseObject,
                        data.subset,
                        data.filter,
                        data.searchAliases,
                        data.selection,
                        data.pagedResults,
                        data.matchedValuesOnly,
                        data.extendedFilter,
                        data.checkOverspecified,
                        data.relaxation,
                        data.extendedArea,
                        data.hierarchySelections,
                        data.searchControlOptions,
                        data.joinArguments,
                        data.joinType,
                        data._unrecognizedExtensionsList,
                        data.serviceControls,
                        data.securityParameters,
                        data.requestor,
                        data.operationProgress,
                        data.aliasedRDNs,
                        data.criticalExtensions,
                        data.referenceType,
                        TRUE, // data.entryOnly,
                        data.exclusions,
                        data.nameResolveOnMaster,
                        data.operationContexts,
                        data.familyGrouping,
                    ),
                };
            searchState.depth++;
            await search_i(
                ctx,
                assn,
                {
                    ...state,
                    admPoints: subordinate.dse.admPoint
                        ? (subordinate.dse.admPoint.administrativeRole.has(AUTONOMOUS)
                            ? [ subordinate ]
                            : [ ...state.admPoints, subordinate ])
                        : [ ...state.admPoints ],
                },
                newArgument,
                searchState,
            );
            searchState.depth--;
        }
        subordinatesInBatch = await readSubordinates(
            ctx,
            target,
            ENTRIES_PER_BATCH,
            undefined,
            cursorId,
        );
    }
}

export default search_ii;
