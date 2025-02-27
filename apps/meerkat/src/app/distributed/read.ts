import { Context, Vertex, ClientAssociation, OperationReturn, IndexableOID } from "@wildboar/meerkat-types";
import { ObjectIdentifier, TRUE_BIT, FALSE_BIT, OBJECT_IDENTIFIER } from "asn1-ts";
import * as errors from "@wildboar/meerkat-types";
import {
    _decode_ReadArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ReadArgument.ta";
import {
    ReadResult,
    _encode_ReadResult,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ReadResult.ta";
import {
    ReadResultData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ReadResultData.ta";
import {
    Chained_ResultType_OPTIONALLY_PROTECTED_Parameter1 as ChainedResult,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/Chained-ResultType-OPTIONALLY-PROTECTED-Parameter1.ta";
import {
    ChainingResults,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/ChainingResults.ta";
import getOptionallyProtectedValue from "@wildboar/x500/src/lib/utils/getOptionallyProtectedValue";
import getDistinguishedName from "../x500/getDistinguishedName";
import {
    EntryInformation,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/EntryInformation.ta";
import {
    id_sc_subentry,
} from "@wildboar/x500/src/lib/modules/InformationFramework/id-sc-subentry.va";
import { SecurityErrorData } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SecurityErrorData.ta";
import {
    SecurityProblem_insufficientAccessRights,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SecurityProblem.ta";
import getRelevantSubentries from "../dit/getRelevantSubentries";
import type ACDFTuple from "@wildboar/x500/src/lib/types/ACDFTuple";
import type ACDFTupleExtended from "@wildboar/x500/src/lib/types/ACDFTupleExtended";
import type ProtectedItem from "@wildboar/x500/src/lib/types/ProtectedItem";
import bacACDF, {
    PERMISSION_CATEGORY_ADD,
    PERMISSION_CATEGORY_REMOVE,
    PERMISSION_CATEGORY_READ,
    PERMISSION_CATEGORY_RENAME,
    PERMISSION_CATEGORY_EXPORT,
    PERMISSION_CATEGORY_DISCLOSE_ON_ERROR,
} from "@wildboar/x500/src/lib/bac/bacACDF";
import getACDFTuplesFromACIItem from "@wildboar/x500/src/lib/bac/getACDFTuplesFromACIItem";
import getIsGroupMember from "../authz/getIsGroupMember";
import type { ModifyRights } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ModifyRights.ta";
import { ModifyRights_Item } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ModifyRights-Item.ta";
import createSecurityParameters from "../x500/createSecurityParameters";
import {
    id_opcode_read,
} from "@wildboar/x500/src/lib/modules/CommonProtocolSpecification/id-opcode-read.va";
import {
    securityError,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/securityError.oa";
import type { OperationDispatcherState } from "./OperationDispatcher";
import { DER } from "asn1-ts/dist/node/functional";
import readPermittedEntryInformation from "../database/entry/readPermittedEntryInformation";
import codeToString from "@wildboar/x500/src/lib/stringifiers/codeToString";
import getStatisticsFromCommonArguments from "../telemetry/getStatisticsFromCommonArguments";
import getEntryInformationSelectionStatistics from "../telemetry/getEntryInformationSelectionStatistics";
import failover from "../utils/failover";
import {
    AbandonedData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AbandonedData.ta";
import {
    abandoned,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/abandoned.oa";
import {
    FamilyReturn_memberSelect_contributingEntriesOnly,
    FamilyReturn_memberSelect_participatingEntriesOnly,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/FamilyReturn.ta";
import readFamily from "../database/family/readFamily";
import readCompoundEntry from "../database/family/readCompoundEntry";
import convertSubtreeToFamilyInformation from "../x500/convertSubtreeToFamilyInformation";
import {
    EntryInformation_information_Item,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/EntryInformation-information-Item.ta";
import {
    FamilyEntries,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/FamilyEntries.ta";
import {
    Attribute,
} from "@wildboar/x500/src/lib/modules/InformationFramework/Attribute.ta";
import {
    family_information,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/family-information.oa";
import {
    AttributeErrorData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AttributeErrorData.ta";
import {
    AttributeErrorData_problems_Item,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AttributeErrorData-problems-Item.ta";
import {
    AttributeProblem_noSuchAttributeOrValue,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AttributeProblem.ta";
import getACIItems from "../authz/getACIItems";
import accessControlSchemesThatUseACIItems from "../authz/accessControlSchemesThatUseACIItems";
import { MINIMUM_MAX_ATTR_SIZE } from "../constants";
import {
    ServiceControlOptions_noSubtypeSelection,
    ServiceControlOptions_dontSelectFriends,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceControlOptions.ta";
import getNamingMatcherGetter from "../x500/getNamingMatcherGetter";
import bacSettings from "../authz/bacSettings";
import {
    NameAndOptionalUID,
} from "@wildboar/x500/src/lib/modules/SelectedAttributeTypes/NameAndOptionalUID.ta";
import preprocessTuples from "../authz/preprocessTuples";
import { attributeError } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/attributeError.oa";
import isOperationalAttributeType from "../x500/isOperationalAttributeType";

/**
 * @summary The read operation, as specified in ITU Recommendation X.511.
 * @description
 *
 * The `read` operation, as specified in ITU Recommendation X.511 (2016),
 * Section 10.1. per the recommended implementation in ITU Recommendation X.518
 * (2016), Section 19.2.
 *
 * @param ctx The context object
 * @param assn The client association
 * @param state The operation dispatcher state
 *
 * @function
 * @async
 */
export
async function read (
    ctx: Context,
    assn: ClientAssociation,
    state: OperationDispatcherState,
): Promise<OperationReturn> {
    const target = state.foundDSE;
    const argument = _decode_ReadArgument(state.operationArgument);
    const data = getOptionallyProtectedValue(argument);
    const op = ("present" in state.invokeId)
        ? assn.invocations.get(Number(state.invokeId.present))
        : undefined;
    const NAMING_MATCHER = getNamingMatcherGetter(ctx);
    const isSubentry: boolean = target.dse.objectClass.has(id_sc_subentry.toString());
    const targetDN = getDistinguishedName(target);
    const relevantSubentries: Vertex[] = isSubentry
        ? []
        : (await Promise.all(
            state.admPoints.map((ap) => getRelevantSubentries(ctx, target, targetDN, ap)),
        )).flat();
    const accessControlScheme = [ ...state.admPoints ] // Array.reverse() works in-place, so we create a new array.
        .reverse()
        .find((ap) => ap.dse.admPoint!.accessControlScheme)?.dse.admPoint!.accessControlScheme;
    const relevantACIItems = getACIItems(accessControlScheme, target, relevantSubentries);
    const acdfTuples: ACDFTuple[] = (relevantACIItems ?? [])
        .flatMap((aci) => getACDFTuplesFromACIItem(aci));
    const isMemberOfGroup = getIsGroupMember(ctx, NAMING_MATCHER);
    const user = state.chainingArguments.originator
        ? new NameAndOptionalUID(
            state.chainingArguments.originator,
            state.chainingArguments.uniqueIdentifier,
        )
        : undefined;
    const relevantTuples: ACDFTupleExtended[] = await preprocessTuples(
        accessControlScheme,
        acdfTuples,
        user,
        state.chainingArguments.authenticationLevel ?? assn.authLevel,
        targetDN,
        isMemberOfGroup,
        NAMING_MATCHER,
    );
    const objectClasses: OBJECT_IDENTIFIER[] = Array.from(target.dse.objectClass).map(ObjectIdentifier.fromString);
    const getPermittedToDoXToY = (y: ProtectedItem): (permissions: number[]) => boolean =>
        (permissions: number[]) =>
            bacACDF(relevantTuples, user, y, permissions, bacSettings, true).authorized;
    const permittedToDoXToThisEntry = getPermittedToDoXToY({
        entry: objectClasses,
    });
    if (
        accessControlScheme
        && accessControlSchemesThatUseACIItems.has(accessControlScheme.toString())
    ) {
        if (!permittedToDoXToThisEntry([ PERMISSION_CATEGORY_READ ])) {
            throw new errors.SecurityError(
                ctx.i18n.t("err:not_authz_read"),
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
    const attributeSizeLimit: number | undefined = (
        Number.isSafeInteger(Number(data.serviceControls?.attributeSizeLimit))
        && (Number(data.serviceControls?.attributeSizeLimit) >= MINIMUM_MAX_ATTR_SIZE)
    )
        ? Number(data.serviceControls!.attributeSizeLimit)
        : undefined;

    const noSubtypeSelection: boolean = (
        data.serviceControls?.options?.[ServiceControlOptions_noSubtypeSelection] === TRUE_BIT);
    const dontSelectFriends: boolean = (
        data.serviceControls?.options?.[ServiceControlOptions_dontSelectFriends] === TRUE_BIT);

    const permittedEntryInfo = await readPermittedEntryInformation(
        ctx,
        target,
        user,
        relevantTuples,
        accessControlScheme,
        {
            selection: data.selection,
            relevantSubentries,
            operationContexts: data.operationContexts,
            attributeSizeLimit,
            noSubtypeSelection,
            dontSelectFriends,
        },
    );

    if (
        target.dse.familyMember
        && data.selection?.familyReturn
        && (data.selection.familyReturn.memberSelect !== FamilyReturn_memberSelect_contributingEntriesOnly)
        && (data.selection.familyReturn.memberSelect !== FamilyReturn_memberSelect_participatingEntriesOnly)
    ) {
        const familySelect: Set<IndexableOID> | null = data.selection?.familyReturn?.familySelect?.length
            ? new Set(data.selection.familyReturn.familySelect.map((oid) => oid.toString()))
            : null;
        const family = await readFamily(ctx, target);
        const familyMembers: Vertex[] = readCompoundEntry(family).next().value;
        const permittedEinfos = await Promise.all(
            familyMembers
                .slice(1) // Skip the first member, which is the read entry.
                .map((member) => readPermittedEntryInformation(
                    ctx,
                    member,
                    user,
                    relevantTuples,
                    accessControlScheme,
                    {
                        selection: data.selection,
                        relevantSubentries,
                        operationContexts: data.operationContexts,
                        attributeSizeLimit,
                        noSubtypeSelection,
                    },
                )),
        );
        const permittedEinfoIndex: Map<number, EntryInformation_information_Item[]> = new Map(
            permittedEinfos.map((einfo, i) => [ familyMembers[i].dse.id, einfo.information ]),
        );
        const familyEntries: FamilyEntries[] = convertSubtreeToFamilyInformation(
            family,
            (vertex: Vertex) => permittedEinfoIndex.get(vertex.dse.id) ?? [],
        )
            .filter((fe) => (!familySelect || familySelect.has(fe.family_class.toString())));
        const familyInfoAttr: Attribute = new Attribute(
            family_information["&id"],
            familyEntries.map((fe) => family_information.encoderFor["&Type"]!(fe, DER)),
            undefined,
        );
        permittedEntryInfo.information.push({
            attribute: familyInfoAttr,
        });
    }

    const selectedAttributes = [
        ...(data.selection?.attributes && ("select" in data.selection.attributes))
            ? data.selection.attributes.select
            : [],
        ...(data.selection?.extraAttributes && ("select" in data.selection.extraAttributes))
            ? data.selection.extraAttributes.select
            : [],
    ];
    if (permittedEntryInfo.information.length === 0) {
        const discloseOnErrorOnAnyOfTheSelectedAttributes: boolean = selectedAttributes
            .some((attr) => {
                const { authorized: authorizedToKnowAboutExcludedAttribute } = bacACDF(
                    relevantTuples,
                    user,
                    {
                        attributeType: attr,
                        operational: isOperationalAttributeType(ctx, attr),
                    },
                    [ PERMISSION_CATEGORY_DISCLOSE_ON_ERROR ],
                    bacSettings,
                    true,
                );
                return authorizedToKnowAboutExcludedAttribute;
            });
        // See ITU Recommendation X.511 (2016), Section 10.1.5.1.b for this part:
        if (
            permittedEntryInfo.incompleteEntry // An attribute value was not permitted to be read...
            && selectedAttributes?.length // ...and the user selected specific attributes
            && discloseOnErrorOnAnyOfTheSelectedAttributes // ...and one such attribute has DiscloseOnError permission
        ) { // We can disclose the attribute's existence via an insufficientAccessRights error.
            throw new errors.SecurityError(
                ctx.i18n.t("err:not_authz_read_selection"),
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
        // Otherwise, we must pretend that the selected attributes simply do not exist.
        throw new errors.AttributeError(
            ctx.i18n.t("err:no_such_attribute_or_value"),
            new AttributeErrorData(
                {
                    rdnSequence: targetDN,
                },
                [
                    ...(data.selection?.attributes && ("select" in data.selection.attributes))
                        ? data.selection.attributes.select
                        : [],
                    ...(data.selection?.extraAttributes && ("select" in data.selection.extraAttributes))
                        ? data.selection.extraAttributes.select
                        : [],
                ]
                    .map((oid) => new AttributeErrorData_problems_Item(
                        AttributeProblem_noSuchAttributeOrValue,
                        oid,
                        undefined,
                    )),
                [],
                createSecurityParameters(
                    ctx,
                    assn.boundNameAndUID?.dn,
                    undefined,
                    attributeError["&errorCode"],
                ),
                ctx.dsa.accessPoint.ae_title.rdnSequence,
                state.chainingArguments.aliasDereferenced,
                undefined,
            ),
        );
    }

    const modifyRights: ModifyRights = [];
    if (
        data.modifyRightsRequest
        // We only return these rights to the user if they are authenticated.
        // TODO: Make this behavior configurable.
        && (("basicLevels" in assn.authLevel) && (assn.authLevel.basicLevels.level > 0))
        && accessControlScheme
        && accessControlSchemesThatUseACIItems.has(accessControlScheme.toString())
    ) {
        const authorizedToAddEntry: boolean = permittedToDoXToThisEntry([ PERMISSION_CATEGORY_ADD ]);
        const authorizedToRemoveEntry: boolean = permittedToDoXToThisEntry([ PERMISSION_CATEGORY_REMOVE ]);
        const authorizedToRenameEntry: boolean = permittedToDoXToThisEntry([ PERMISSION_CATEGORY_RENAME ]);
        const authorizedToMoveEntry: boolean = permittedToDoXToThisEntry([ PERMISSION_CATEGORY_EXPORT ]);
        modifyRights.push(new ModifyRights_Item(
            {
                entry: null,
            },
            new Uint8ClampedArray([
                authorizedToAddEntry ? TRUE_BIT : FALSE_BIT,
                authorizedToRemoveEntry ? TRUE_BIT : FALSE_BIT,
                authorizedToRenameEntry ? TRUE_BIT : FALSE_BIT,
                authorizedToMoveEntry ? TRUE_BIT : FALSE_BIT,
            ]),
        ));
        // Return permissions for the selected attribute types, since they seem to be of interest.
        for (const attr of selectedAttributes) {
            const permittedToDoXToAttributeType = getPermittedToDoXToY({
                attributeType: attr,
            });
            const authorizedToAdd: boolean = permittedToDoXToAttributeType([ PERMISSION_CATEGORY_ADD ]);
            const authorizedToRemove: boolean = permittedToDoXToAttributeType([ PERMISSION_CATEGORY_REMOVE ]);
            const authorizedToRename: boolean = permittedToDoXToAttributeType([ PERMISSION_CATEGORY_RENAME ]);
            const authorizedToMove: boolean = permittedToDoXToAttributeType([ PERMISSION_CATEGORY_EXPORT ]);
            modifyRights.push(new ModifyRights_Item(
                {
                    attribute: attr,
                },
                new Uint8ClampedArray([
                    authorizedToAdd ? TRUE_BIT : FALSE_BIT,
                    authorizedToRemove ? TRUE_BIT : FALSE_BIT,
                    authorizedToRename ? TRUE_BIT : FALSE_BIT,
                    authorizedToMove ? TRUE_BIT : FALSE_BIT,
                ]),
            ));
        }
    }

    const result: ReadResult = {
        unsigned: new ReadResultData(
            new EntryInformation(
                {
                    rdnSequence: targetDN,
                },
                !target.dse.shadow,
                permittedEntryInfo.information,
                permittedEntryInfo.discloseIncompleteEntry
                    ? permittedEntryInfo.incompleteEntry
                    : false,
                state.partialName,
                false,
            ),
            (
                data.modifyRightsRequest
                && accessControlScheme
                && accessControlSchemesThatUseACIItems.has(accessControlScheme.toString())
            )
                ? modifyRights
                : undefined,
            [],
            createSecurityParameters(
                ctx,
                assn.boundNameAndUID?.dn,
                id_opcode_read,
            ),
            ctx.dsa.accessPoint.ae_title.rdnSequence,
            state.chainingArguments.aliasDereferenced,
            undefined,
        ),
    };
    return {
        result: {
            unsigned: new ChainedResult(
                new ChainingResults(
                    undefined,
                    undefined,
                    createSecurityParameters(
                        ctx,
                        assn.boundNameAndUID?.dn,
                        id_opcode_read,
                    ),
                    undefined,
                ),
                _encode_ReadResult(result, DER),
            ),
        },
        stats: {
            request: failover(() => ({
                operationCode: codeToString(id_opcode_read),
                ...getStatisticsFromCommonArguments(data),
                targetNameLength: targetDN.length,
                eis: data.selection
                    ? getEntryInformationSelectionStatistics(data.selection)
                    : undefined,
                modifyRightsRequest: data.modifyRightsRequest,
            }), undefined),
        },
    };
}

export default read;
