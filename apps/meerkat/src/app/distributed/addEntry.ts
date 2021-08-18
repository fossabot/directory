import { Context, IndexableOID, StoredAttributeValueWithContexts, StoredContext, Vertex } from "../types";
import {
    _decode_AddEntryArgument,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AddEntryArgument.ta";
import {
    id_at_objectClass,
} from "@wildboar/x500/src/lib/modules/InformationFramework/id-at-objectClass.va";
import type {
    AttributeType,
} from "@wildboar/x500/src/lib/modules/InformationFramework/AttributeType.ta";
import {
    AttributeError,
    SecurityError,
    ServiceError,
    UpdateError,
} from "../errors";
import {
    UpdateErrorData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/UpdateErrorData.ta";
import type {
    Name,
} from "@wildboar/x500/src/lib/modules/InformationFramework/Name.ta";
import {
    UpdateProblem_objectClassViolation,
    UpdateProblem_entryAlreadyExists,
    UpdateProblem_namingViolation,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/UpdateProblem.ta";
import {
    AttributeProblem_undefinedAttributeType,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AttributeProblem.ta";
// import {
//     id_oa_hierarchyTop,
// } from "@wildboar/x500/src/lib/modules/InformationFramework/id-oa-hierarchyTop.va";
// import {
//     id_oa_hierarchyLevel,
// } from "@wildboar/x500/src/lib/modules/InformationFramework/id-oa-hierarchyLevel.va";
// import {
//     id_oa_hierarchyBelow,
// } from "@wildboar/x500/src/lib/modules/InformationFramework/id-oa-hierarchyBelow.va";
// import {
//     id_oa_hierarchyParent,
// } from "@wildboar/x500/src/lib/modules/InformationFramework/id-oa-hierarchyParent.va";
import {
    ServiceControlOptions_manageDSAIT,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceControlOptions.ta";
import {
    AttributeUsage_userApplications,
} from "@wildboar/x500/src/lib/modules/InformationFramework/AttributeUsage.ta";
import {
    AttributeErrorData_problems_Item,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AttributeErrorData-problems-Item.ta";
import { DERElement, ObjectIdentifier, OBJECT_IDENTIFIER, TRUE_BIT } from "asn1-ts";
import { v4 as uuid } from "uuid";
import {
    EXT_BIT_MANAGE_DSA_IT,
    EXT_BIT_USE_OF_CONTEXTS,
} from "../x500/extensions";
import { AttributeErrorData } from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AttributeErrorData.ta";
import {
    SecurityErrorData,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SecurityErrorData.ta";
import {
    SecurityProblem_insufficientAccessRights,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/SecurityProblem.ta";
import {
    ServiceErrorData,
    ServiceProblem_unavailable,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/ServiceErrorData.ta";
import {
    _encode_AddEntryResult,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/AddEntryResult.ta";
import writeEntry from "../database/writeEntry";
import readChildren from "../dit/readChildren";
import getRDN from "../x500/getRDN";
import {
    Chained_ArgumentType_OPTIONALLY_PROTECTED_Parameter1 as ChainedArgument,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/Chained-ArgumentType-OPTIONALLY-PROTECTED-Parameter1.ta";
import {
    Chained_ResultType_OPTIONALLY_PROTECTED_Parameter1 as ChainedResult,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/Chained-ResultType-OPTIONALLY-PROTECTED-Parameter1.ta";
import {
    ChainingResults,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/ChainingResults.ta";
import compareRDN from "@wildboar/x500/src/lib/comparators/compareRelativeDistinguishedName";

const OBJECT_CLASS_ERROR_DATA = new UpdateErrorData(
    UpdateProblem_objectClassViolation,
    undefined,
    [],
    undefined,
    undefined,
    undefined,
    undefined,
);
const ENTRY_EXISTS_ERROR_DATA = new UpdateErrorData(
    UpdateProblem_entryAlreadyExists,
    undefined,
    [],
    undefined,
    undefined,
    undefined,
    undefined,
);
const CANNOT_MANAGE_OPERATIONAL_ATTRIBUTES_ERROR_DATA = new SecurityErrorData(
    SecurityProblem_insufficientAccessRights,
    undefined,
    undefined,
    [],
    undefined,
    undefined,
    undefined,
    undefined,
);

function missingAttributeErrorData (attributeTypes: AttributeType[]): UpdateErrorData {
    return new UpdateErrorData(
        UpdateProblem_objectClassViolation,
        attributeTypes.map((at) => ({
            attributeType: at,
        })),
        [],
        undefined,
        undefined,
        undefined,
        undefined,
    );
}

function namingViolationErrorData (attributeTypes: AttributeType[]): UpdateErrorData {
    return new UpdateErrorData(
        UpdateProblem_namingViolation,
        attributeTypes.map((at) => ({
            attributeType: at,
        })),
        [],
        undefined,
        undefined,
        undefined,
        undefined,
    );
}

function unrecognizedAttributeErrorData (
    name: Name,
    attributeTypes: AttributeType[],
): AttributeErrorData {
    return new AttributeErrorData(
        name,
        attributeTypes.map((at) => new AttributeErrorData_problems_Item(
            AttributeProblem_undefinedAttributeType,
            at,
            undefined,
        )),
        [],
        undefined,
        undefined,
        undefined,
        undefined,
    );
}

export
async function addEntry (
    ctx: Context,
    immediateSuperior: Vertex,
    admPoints: Vertex[],
    request: ChainedArgument,
): Promise<ChainedResult> {
    const argument = _decode_AddEntryArgument(request.argument);
    const data = ("signed" in argument)
        ? argument.signed.toBeSigned
        : argument.unsigned;
    if (immediateSuperior.dse.alias) {
        throw new UpdateError(
            "New entry inserted below an entry of a forbidden DSE type, such as an alias.",
            namingViolationErrorData([]),
        );
    }

    // TODO: Check ACI

    const NAMING_MATCHER = (
        attributeType: OBJECT_IDENTIFIER,
    ) => ctx.attributes.get(attributeType.toString())?.namingMatcher;

    const rdn = getRDN(request.chainedArgument.targetObject ?? data.object.rdnSequence);
    if (!rdn) {
        throw new UpdateError(
            "The Root DSE may not be added.",
            namingViolationErrorData([]),
        );
    }
    const existingSiblings = await readChildren(ctx, immediateSuperior);
    const entryAlreadyExists: boolean = existingSiblings
        .some((xs) => compareRDN(xs.dse.rdn, rdn, NAMING_MATCHER));
    if (entryAlreadyExists) {
        throw new UpdateError(
            "Entry already exists.",
            ENTRY_EXISTS_ERROR_DATA,
        );
    }

    // TODO: If TargetSystem !== this DSA, establish HOB with inferior DSA.

    const entry = uuid();
    const attrsFromDN: StoredAttributeValueWithContexts[] = rdn
        .map((atav): StoredAttributeValueWithContexts => ({
            id: atav.type_,
            value: atav.value,
            contexts: new Map([]),
        }));

    // TODO: use memory/valuesFromAttribute
    const attrs: StoredAttributeValueWithContexts[] = data.entry.flatMap((attr) => [
        ...attr.values.map((value): StoredAttributeValueWithContexts => ({
            id: attr.type_,
            value,
            contexts: new Map([]),
        })),
        ...attr.valuesWithContext?.map((vwc): StoredAttributeValueWithContexts => ({
            id: attr.type_,
            value: vwc.value,
            contexts: new Map(
                vwc.contextList.map((context): [ string, StoredContext ] => [
                    context.contextType.toString(),
                    {
                        id: context.contextType,
                        fallback: context.fallback ?? false,
                        values: context.contextValues,
                    },
                ]),
            ),
        })) ?? [],
    ]);

    const attributesByType: Map<IndexableOID, StoredAttributeValueWithContexts[]> = new Map();
    const nonUserApplicationAttributes: AttributeType[] = [];
    const unrecognizedAttributes: AttributeType[] = [];
    const attributesUsingContexts: AttributeType[] = [];
    attrs.forEach((attr) => {
        const ATTR_OID: string = attr.id.toString();
        const current = attributesByType.get(ATTR_OID);
        if (!current) {
            attributesByType.set(ATTR_OID, [ attr ]);
        } else {
            current.push(attr);
        }
        const spec = ctx.attributes.get(ATTR_OID);
        if (!spec) {
            unrecognizedAttributes.push(attr.id);
            return;
        }
        if (spec.usage !== AttributeUsage_userApplications) {
            nonUserApplicationAttributes.push(attr.id);
        }
        if (attr.contexts.size > 0) {
            attributesUsingContexts.push(attr.id);
        }
    });

    if (unrecognizedAttributes.length > 0) {
        throw new AttributeError(
            `Unrecognized attributes: ${unrecognizedAttributes.map((at) => at.toString()).join(", ")}.`,
            unrecognizedAttributeErrorData(data.object, unrecognizedAttributes),
        );
    }

    const useOfContexts = (data.criticalExtensions?.[EXT_BIT_USE_OF_CONTEXTS] === TRUE_BIT);
    if (!useOfContexts && (attributesUsingContexts.length > 0)) {
        throw new ServiceError(
            "Use of contexts was not enabled by the request.",
            new ServiceErrorData(
                ServiceProblem_unavailable,
                [],
                undefined,
                undefined,
                undefined,
                undefined,
            ),
        );
    }

    const objectClasses = attrs.filter((attr) => attr.id.isEqualTo(id_at_objectClass));
    if (objectClasses.length === 0) {
        throw new UpdateError("Object class attribute not found.", OBJECT_CLASS_ERROR_DATA);
    }

    objectClasses
        .map((oc) => ctx.objectClasses.get(oc.value.objectIdentifier.toString()))
        .forEach((oc, i) => {
            if (!oc) {
                ctx.log.warn(
                    `Object class ${objectClasses[i]?.value.objectIdentifier} not understood.`,
                );
                return;
            }
            const missingMandatoryAttributes: ObjectIdentifier[] = Array
                .from(oc.mandatoryAttributes.values())
                .filter((mandate): boolean => !attributesByType.has(mandate))
                .map((mandate: string) => new ObjectIdentifier(
                    mandate.split(".").map((node) => Number.parseInt(node)),
                ));
            if (missingMandatoryAttributes.length > 0) {
                throw new UpdateError(
                    `Missing mandatory attributes: ${missingMandatoryAttributes.map((ma) => ma.toString())}.`,
                    missingAttributeErrorData(missingMandatoryAttributes),
                );
            }
            // Optional attributes are not checked.
        });

    const rdnAttributes: Set<IndexableOID> = new Set();
    const duplicatedAFDNs: AttributeType[] = [];
    const unrecognizedAFDNs: AttributeType[] = [];
    const cannotBeUsedInNameAFDNs: AttributeType[] = [];
    const unmatchedAFDNs: AttributeType[] = [];

    console.log(attrs);

    attrsFromDN
        .forEach((afdn): void => {
            const oid: string = afdn.id.toString();
            if (rdnAttributes.has(oid)) {
                duplicatedAFDNs.push(afdn.id);
                return;
            } else {
                rdnAttributes.add(oid);
            }
            const spec = ctx.attributes.get(afdn.id.toString());
            if (!spec) {
                unrecognizedAFDNs.push(afdn.id);
                return;
            }
            const matcher = spec.namingMatcher;
            if (!matcher) {
                cannotBeUsedInNameAFDNs.push(afdn.id);
                return;
            }
            const someAttributeMatched = attrs.some((attr) => (
                (attr.contexts.size === 0)
                && attr.id.isEqualTo(afdn.id)
                && matcher(attr.value, afdn.value)
            ));
            if (!someAttributeMatched) {
                unmatchedAFDNs.push(afdn.id);
                return;
            }
        });

    if (duplicatedAFDNs.length > 0) {
        throw new UpdateError(
            "Attributes of the following types in the RDNs of the entry were "
            + `duplicated: ${duplicatedAFDNs.join(", ")}`,
            namingViolationErrorData(duplicatedAFDNs),
        );
    }

    if (unrecognizedAFDNs.length > 0) {
        throw new UpdateError(
            "Attributes of the following types in the RDNs of the entry were "
            + `not recognized, and therefore cannot be used for naming: ${unrecognizedAFDNs.join(", ")}`,
            namingViolationErrorData(unrecognizedAFDNs),
        );
    }

    if (cannotBeUsedInNameAFDNs.length > 0) {
        throw new UpdateError(
            "Attributes of the following types in the RDNs of the entry are "
            + `innately not suitable for naming: ${cannotBeUsedInNameAFDNs.join(", ")}`,
            namingViolationErrorData(cannotBeUsedInNameAFDNs),
        );
    }

    if (unmatchedAFDNs.length > 0) {
        throw new UpdateError(
            "Attributes of the following types in the RDNs of the entry did not "
            + `have matching values in the attributes: ${unmatchedAFDNs.join(", ")}`,
            namingViolationErrorData(unmatchedAFDNs),
        );
    }

    /**
     * throw parentNotAncestor if the parent is a part of a compound entry, but
     * it is not the ancestor of that compound entry. From what I can tell, this
     * means checking that the parent is not of object class `child`. (X.501, Section 8.11.)
     *
     * 7.1.2 ancestor: The entry at the root of the hierarchy of family members that comprise a compound entry.
     *
     * 7.1.3
     *  compound entry: A representation of an object in terms of family members that are hierarchically organized
     *  into one or more families of entries.
     *
     *  X.501, Section 14.10:
     *  If the immediately hierarchical parent is a compound entry, the value shall be the distinguished name
     *  of the ancestor. Otherwise, the Directory shall return an Update Error with problem parentNotAncestor .
     */
    // How do you insert DSEs of any non-entry type if dseType is an operational attribute?
    // X.511, Section 7.12 specifies this exactly:
    // – the manageDSAIT extension bit shall be set;
    // – the manageDSAIT option shall be set;
    // – the manageDSAITPlaneRef option shall be included if a specific replication plane is to be managed.
    const manageDSAITExtension: boolean = (data.criticalExtensions?.[EXT_BIT_MANAGE_DSA_IT] === TRUE_BIT);
    const manageDSAITSCO: boolean = (data.serviceControls?.options?.[ServiceControlOptions_manageDSAIT] === TRUE_BIT);
    // Only necessary if a specific DSA IT is to be managed.
    // const manageDSAITPlaneRef = data.serviceControls?.manageDSAITPlaneRef;
    const requestedToManageDSA: boolean = (manageDSAITExtension && manageDSAITSCO);

    if (requestedToManageDSA) {
    // TODO: aliases contain aliasedEntryName
    // TODO: aliased entry exists
    // TODO: aliases are not allowed to point to other aliases
    } else if (nonUserApplicationAttributes.length > 0) {
        throw new SecurityError(
            "Operational attributes may not be managed without setting the manageDSAIT flag.",
            CANNOT_MANAGE_OPERATIONAL_ATTRIBUTES_ERROR_DATA,
        );
    }

    const now = new Date();
    const newEntry: Vertex = {
        immediateSuperior,
        subordinates: [],
        dse: {
            id: -1,
            uuid: entry,
            rdn,
            entry: {},
            createdTimestamp: now,
            modifyTimestamp: now,
            creatorsName: {
                rdnSequence: [], // FIXME:
            },
            modifiersName: {
                rdnSequence: [], // FIXME:
            },
            objectClass: new Set(objectClasses.map((attr) => attr.value.objectIdentifier.toString())),
        },
    };
    await writeEntry(ctx, immediateSuperior, newEntry, [ ...attrsFromDN, ...attrs ]);
    immediateSuperior.subordinates?.push(newEntry);
    // TODO: Schedule modification of RHOBs with subordinate DSAs.
    // TODO: Filter out more operational attributes.
    // TODO: Update shadows
    return new ChainedResult(
        new ChainingResults(
            undefined,
            undefined,
            undefined,
            undefined,
        ),
        _encode_AddEntryResult({
            null_: null,
        }, () => new DERElement()),
    );
}
