import { Vertex, ClientAssociation, OperationReturn } from "@wildboar/meerkat-types";
import type { MeerkatContext } from "../ctx";
import { ObjectIdentifier } from "asn1-ts";
import * as errors from "@wildboar/meerkat-types";
import {
    _decode_RemoveEntryArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/RemoveEntryArgument.ta";
import {
    _encode_RemoveEntryResult,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/RemoveEntryResult.ta";
import deleteEntry from "../database/deleteEntry";
import {
    Chained_ResultType_OPTIONALLY_PROTECTED_Parameter1 as ChainedResult,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/Chained-ResultType-OPTIONALLY-PROTECTED-Parameter1.ta";
import {
    ChainingResults,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/ChainingResults.ta";
import { BERElement } from "asn1-ts";
import getOptionallyProtectedValue from "@wildboar/x500/src/lib/utils/getOptionallyProtectedValue";
import { strict as assert } from "assert";
import {
    id_op_binding_hierarchical,
} from "@wildboar/x500/src/lib/modules/DirectoryOperationalBindingTypes/id-op-binding-hierarchical.va";
import {
    HierarchicalAgreement,
    _decode_HierarchicalAgreement,
} from "@wildboar/x500/src/lib/modules/HierarchicalOperationalBindings/HierarchicalAgreement.ta";
import {
    AccessPoint,
    _decode_AccessPoint,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/AccessPoint.ta";
import getDistinguishedName from "../x500/getDistinguishedName";
import { OperationalBindingID } from "@wildboar/x500/src/lib/modules/OperationalBindingManagement/OperationalBindingID.ta";
import type {
    DistinguishedName,
} from "@wildboar/x500/src/lib/modules/InformationFramework/DistinguishedName.ta";
import compareDistinguishedName from "@wildboar/x500/src/lib/comparators/compareDistinguishedName";
import terminateByTypeAndBindingID from "../dop/terminateByTypeAndBindingID";
import { SecurityErrorData } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SecurityErrorData.ta";
import {
    SecurityProblem_insufficientAccessRights,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SecurityProblem.ta";
import getRelevantSubentries from "../dit/getRelevantSubentries";
import type ACDFTuple from "@wildboar/x500/src/lib/types/ACDFTuple";
import type ACDFTupleExtended from "@wildboar/x500/src/lib/types/ACDFTupleExtended";
import bacACDF, {
    PERMISSION_CATEGORY_REMOVE,
} from "@wildboar/x500/src/lib/bac/bacACDF";
import getACDFTuplesFromACIItem from "@wildboar/x500/src/lib/bac/getACDFTuplesFromACIItem";
import getIsGroupMember from "../authz/getIsGroupMember";
import createSecurityParameters from "../x500/createSecurityParameters";
import {
    id_opcode_removeEntry,
} from "@wildboar/x500/src/lib/modules/CommonProtocolSpecification/id-opcode-removeEntry.va";
import {
    securityError,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/securityError.oa";
import {
    ServiceProblem_timeLimitExceeded
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceProblem.ta";
import {
    ServiceErrorData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceErrorData.ta";
import {
    serviceError,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/serviceError.oa";
import getDateFromTime from "@wildboar/x500/src/lib/utils/getDateFromTime";
import type { OperationDispatcherState } from "./OperationDispatcher";
import { DER } from "asn1-ts/dist/node/functional";
import codeToString from "@wildboar/x500/src/lib/stringifiers/codeToString";
import getStatisticsFromCommonArguments from "../telemetry/getStatisticsFromCommonArguments";
import getNamingMatcherGetter from "../x500/getNamingMatcherGetter";
import failover from "../utils/failover";
import {
    AbandonedData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AbandonedData.ta";
import {
    abandoned,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/abandoned.oa";
import {
    id_oc_parent,
} from "@wildboar/x500/src/lib/modules/InformationFramework/id-oc-parent.va";
import {
    id_oc_child,
} from "@wildboar/x500/src/lib/modules/InformationFramework/id-oc-child.va";
import {
    FamilyGrouping_compoundEntry,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/FamilyGrouping.ta";
import {
    UpdateErrorData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/UpdateErrorData.ta";
import {
    updateError,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/updateError.oa";
import {
    UpdateProblem_notAncestor,
    UpdateProblem_notAllowedOnNonLeaf,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/UpdateProblem.ta";
import getACIItems from "../authz/getACIItems";
import accessControlSchemesThatUseACIItems from "../authz/accessControlSchemesThatUseACIItems";
import getRelevantOperationalBindings from "../dop/getRelevantOperationalBindings";
import updateAffectedSubordinateDSAs from "../dop/updateAffectedSubordinateDSAs";
import updateSuperiorDSA from "../dop/updateSuperiorDSA";
import bacSettings from "../authz/bacSettings";
import {
    NameAndOptionalUID,
} from "@wildboar/x500/src/lib/modules/SelectedAttributeTypes/NameAndOptionalUID.ta";
import preprocessTuples from "../authz/preprocessTuples";
import removeAttribute from "../database/entry/removeAttribute";
import {
    hierarchyParent,
} from "@wildboar/x500/src/lib/modules/InformationFramework/hierarchyParent.oa";

const PARENT: string = id_oc_parent.toString();
const CHILD: string = id_oc_child.toString();

/**
 * @summary The removeEntry operation, as specified in ITU Recommendation X.511.
 * @description
 *
 * The `removeEntry` operation, as specified in ITU Recommendation X.511 (2016),
 * Section 12.2. per the recommended implementation in ITU Recommendation X.518
 * (2016), Section 19.1.2.
 *
 * @param ctx The context object
 * @param assn The client association
 * @param state The operation dispatcher state
 *
 * @function
 * @async
 */
export
async function removeEntry (
    ctx: MeerkatContext,
    assn: ClientAssociation,
    state: OperationDispatcherState,
): Promise<OperationReturn> {
    const NAMING_MATCHER = getNamingMatcherGetter(ctx);
    const target = state.foundDSE;
    const argument = _decode_RemoveEntryArgument(state.operationArgument);
    const data = getOptionallyProtectedValue(argument);
    const op = ("present" in state.invokeId)
        ? assn.invocations.get(Number(state.invokeId.present))
        : undefined;
    const timeLimitEndTime: Date | undefined = state.chainingArguments.timeLimit
        ? getDateFromTime(state.chainingArguments.timeLimit)
        : undefined;
    const checkTimeLimit = () => {
        if (timeLimitEndTime && (new Date() > timeLimitEndTime)) {
            throw new errors.ServiceError(
                ctx.i18n.t("err:time_limit"),
                new ServiceErrorData(
                    ServiceProblem_timeLimitExceeded,
                    [],
                    createSecurityParameters(
                        ctx,
                        assn.boundNameAndUID?.dn,
                        undefined,
                        serviceError["&errorCode"],
                    ),
                    ctx.dsa.accessPoint.ae_title.rdnSequence,
                    state.chainingArguments.aliasDereferenced,
                    undefined,
                ),
            );
        }
    };
    const targetDN = getDistinguishedName(target);
    const user = state.chainingArguments.originator
        ? new NameAndOptionalUID(
            state.chainingArguments.originator,
            state.chainingArguments.uniqueIdentifier,
        )
        : undefined;
    const relevantSubentries: Vertex[] = (await Promise.all(
        state.admPoints.map((ap) => getRelevantSubentries(ctx, target, targetDN, ap)),
    )).flat();
    const accessControlScheme = [ ...state.admPoints ] // Array.reverse() works in-place, so we create a new array.
        .reverse()
        .find((ap) => ap.dse.admPoint!.accessControlScheme)?.dse.admPoint!.accessControlScheme;
    if (
        accessControlScheme
        && accessControlSchemesThatUseACIItems.has(accessControlScheme.toString())
    ) {
        const relevantACIItems = getACIItems(accessControlScheme, target, relevantSubentries);
        const acdfTuples: ACDFTuple[] = (relevantACIItems ?? [])
            .flatMap((aci) => getACDFTuplesFromACIItem(aci));
        const NAMING_MATCHER = getNamingMatcherGetter(ctx);
        const isMemberOfGroup = getIsGroupMember(ctx, NAMING_MATCHER);
        const relevantTuples: ACDFTupleExtended[] = await preprocessTuples(
            accessControlScheme,
            acdfTuples,
            user,
            state.chainingArguments.authenticationLevel ?? assn.authLevel,
            targetDN,
            isMemberOfGroup,
            NAMING_MATCHER,
        );
        const {
            authorized: authorizedToRemoveEntry,
        } = bacACDF(
            relevantTuples,
            user,
            {
                entry: Array.from(target.dse.objectClass).map(ObjectIdentifier.fromString),
            },
            [
                PERMISSION_CATEGORY_REMOVE,
            ],
            bacSettings,
            true,
        );
        if (!authorizedToRemoveEntry) {
            throw new errors.SecurityError(
                ctx.i18n.t("err:not_authz_remove_entry"),
                new SecurityErrorData(
                    SecurityProblem_insufficientAccessRights,
                    undefined,
                    undefined,
                    [],
                    createSecurityParameters(
                        ctx,
                        assn.boundNameAndUID?.dn,
                        undefined,
                        securityError["&errorCode"],
                    ),
                    ctx.dsa.accessPoint.ae_title.rdnSequence,
                    state.chainingArguments.aliasDereferenced,
                    undefined,
                ),
            );
        }
    }

    const nonChildSubordinate = await ctx.db.entry.findFirst({
        where: {
            immediate_superior_id: target.dse.id,
            deleteTimestamp: null,
            EntryObjectClass: {
                none: {
                    object_class: CHILD,
                },
            },
        },
        select: {
            id: true,
        },
    });
    if (nonChildSubordinate) {
        throw new errors.UpdateError(
            ctx.i18n.t("err:not_allowed_on_non_leaf"),
            new UpdateErrorData(
                UpdateProblem_notAllowedOnNonLeaf,
                undefined,
                [],
                createSecurityParameters(
                    ctx,
                    assn.boundNameAndUID?.dn,
                    undefined,
                    updateError["&errorCode"],
                ),
                ctx.dsa.accessPoint.ae_title.rdnSequence,
                state.chainingArguments.aliasDereferenced,
                undefined,
            ),
        );
    }

    const isParent: boolean = target.dse.objectClass.has(PARENT);
    const isChild: boolean = target.dse.objectClass.has(CHILD);
    const isAncestor: boolean = (isParent && !isChild);
    if (!isAncestor && (data.familyGrouping === FamilyGrouping_compoundEntry)) {
        throw new errors.UpdateError(
            ctx.i18n.t("err:not_ancestor"),
            new UpdateErrorData(
                UpdateProblem_notAncestor,
                undefined,
                [],
                createSecurityParameters(
                    ctx,
                    assn.boundNameAndUID?.dn,
                    undefined,
                    updateError["&errorCode"],
                ),
                ctx.dsa.accessPoint.ae_title.rdnSequence,
                state.chainingArguments.aliasDereferenced,
                undefined,
            ),
        );
    }
    const alsoDeleteFamily: boolean = (isAncestor && (data.familyGrouping === FamilyGrouping_compoundEntry));

    checkTimeLimit();
    if (target.dse.subentry) { // Go to step 5.
        // Steps moved to run _after_ the local deletion of the DSE.
        if (target.immediateSuperior?.dse.cp) {
            // DEVIATION:
            // The specification does NOT say that you have to update the
            // superior's subentries for the new CP. Meerkat DSA does this
            // anyway, just without awaiting.
            updateSuperiorDSA(
                ctx,
                targetDN.slice(0, -1),
                target.immediateSuperior!,
                state.chainingArguments.aliasDereferenced ?? false,
            ); // INTENTIONAL_NO_AWAIT
        }
    } else if (target.dse.cp) { // Go to step 6.
        // 1. Remove the naming context.
        // 2. Terminate the HOB, if applicable.
        // - a. Query the database for all active HOBs where local DSA is subordinate
        //      and immediate_superior + rdn === this entry. Include the access point (ber).
        // - c. Issue a terminate OB operation to all relevant access points.
        const targetDN = getDistinguishedName(target);
        const relevantOperationalBindings = await getRelevantOperationalBindings(ctx, false);
        for (const ob of relevantOperationalBindings) {
            if (!ob.access_point) {
                continue;
            }
            const argreementElement = new BERElement();
            argreementElement.fromBytes(ob.agreement_ber);
            const agreement: HierarchicalAgreement = _decode_HierarchicalAgreement(argreementElement);
            const agreementDN: DistinguishedName = [
                ...agreement.immediateSuperior,
                agreement.rdn,
            ];
            const match = compareDistinguishedName(targetDN, agreementDN, NAMING_MATCHER);
            if (!match) {
                continue;
            }
            const bindingID = new OperationalBindingID(
                ob.binding_identifier,
                ob.binding_version,
            );
            const accessPointElement = new BERElement();
            accessPointElement.fromBytes(ob.access_point.ber);
            const accessPoint: AccessPoint = _decode_AccessPoint(accessPointElement);
            try {
                assert(target.immediateSuperior);
                // We do not await the return value. This can run independently
                // of returning from this operation.
                terminateByTypeAndBindingID(
                    ctx,
                    accessPoint,
                    id_op_binding_hierarchical,
                    bindingID,
                    state.chainingArguments.aliasDereferenced,
                )
                    .catch((e) => {
                        ctx.log.warn(ctx.i18n.t("log:failed_to_update_hob", {
                            obid: bindingID.identifier.toString(),
                            version: bindingID.version.toString(),
                            e: e.message,
                        }), {
                            remoteFamily: assn.socket.remoteFamily,
                            remoteAddress: assn.socket.remoteAddress,
                            remotePort: assn.socket.remotePort,
                            association_id: assn.id,
                        });
                    });
            } catch (e) {
                ctx.log.warn(ctx.i18n.t("log:failed_to_update_hob", {
                    obid: bindingID.identifier.toString(),
                    version: bindingID.version.toString(),
                    e: e.message,
                }), {
                    remoteFamily: assn.socket.remoteFamily,
                    remoteAddress: assn.socket.remoteAddress,
                    remotePort: assn.socket.remotePort,
                    association_id: assn.id,
                });
                continue;
            }
        }
    } else if (target.dse.entry || target.dse.alias) { // Go to step 4.
        // 1. Remove the entry or alias entry.
        // 2. Continue at step 7.
    }
    // TODO: Step 7: Update shadows.

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
    if (op) {
        op.pointOfNoReturnTime = new Date();
    }
    /** Remove the `hierarchyParent` attribute so hierarchical children are updated */
    ctx.db.$transaction(await removeAttribute(ctx, target, hierarchyParent["&id"]))
        .then()
        .catch();
    await deleteEntry(ctx, target, alsoDeleteFamily);

    if (target.dse.subentry) {
        // 1. Remove the subentry.
        // 2. Modify the operational bindings of all relevant subordinate DSAs.
        // - a. Get the DN administrative point
        // - b. Query the database for all active HOBs where local DSA is superior
        //      and admin point is a prefix of immediate_superior. Include the access point (ber).
        // - c. Issue a modify OB operation to all relevant access points.
        // 3. Continue at step 7.
        updateAffectedSubordinateDSAs(ctx, targetDN.slice(0, -1)); // INTENTIONAL_NO_AWAIT
    }

    return {
        result: {
            unsigned: new ChainedResult(
                new ChainingResults(
                    undefined,
                    undefined,
                    createSecurityParameters(
                        ctx,
                        assn.boundNameAndUID?.dn,
                        id_opcode_removeEntry,
                    ),
                    undefined,
                ),
                _encode_RemoveEntryResult({
                    null_: null,
                }, DER),
            ),
        },
        stats: {
            request: failover(() => ({
                operationCode: codeToString(id_opcode_removeEntry),
                ...getStatisticsFromCommonArguments(data),
                targetNameLength: targetDN.length,
            }), undefined),
        },
    };
}

export default removeEntry;
