import { randomUUID } from "crypto";
import {
    ObjectClassKind,
} from "@wildboar/x500/src/lib/modules/InformationFramework/ObjectClassKind.ta";
import type {
    Name,
} from "@wildboar/x500/src/lib/modules/InformationFramework/Name.ta";
import type {
    RelativeDistinguishedName,
} from "@wildboar/x500/src/lib/modules/InformationFramework/RelativeDistinguishedName.ta";
import {
    AttributeUsage,
} from "@wildboar/x500/src/lib/modules/InformationFramework/AttributeUsage.ta";
import type {
    EqualityMatcher,
} from "@wildboar/x500/src/lib/types/EqualityMatcher";
import type {
    OrderingMatcher,
} from "@wildboar/x500/src/lib/types/OrderingMatcher";
import type {
    SubstringsMatcher,
} from "@wildboar/x500/src/lib/types/SubstringsMatcher";
import type {
    ContextMatcher,
} from "@wildboar/x500/src/lib/types/ContextMatcher";
import type { ASN1Element, OBJECT_IDENTIFIER, BIT_STRING, INTEGER, BOOLEAN } from "asn1-ts";
import type {
    PagedResultsRequest_newRequest,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/PagedResultsRequest-newRequest.ta";
import type {
    SubtreeSpecification,
} from "@wildboar/x500/src/lib/modules/InformationFramework/SubtreeSpecification.ta";3
import type {
    ACIItem,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/ACIItem.ta";
import type {
    AccessPoint,
} from "@wildboar/x500/src/lib/modules/DistributedOperations/AccessPoint.ta";
import type {
    Attribute,
} from "@wildboar/x500/src/lib/modules/InformationFramework/Attribute.ta";
import type {
    TypeAndContextAssertion,
} from "@wildboar/x500/src/lib/modules/DirectoryAbstractService/TypeAndContextAssertion.ta";
import type {
    SearchRuleDescription,
} from "@wildboar/x500/src/lib/modules/InformationFramework/SearchRuleDescription.ta";
import type {
    PwdEncAlg,
} from "@wildboar/x500/src/lib/modules/PasswordPolicy/PwdEncAlg.ta";
import type {
    AttributeType,
} from "@wildboar/x500/src/lib/modules/InformationFramework/AttributeType.ta";
import type LDAPSyntaxDecoder from "@wildboar/ldap/src/lib/types/LDAPSyntaxDecoder";
import type LDAPSyntaxEncoder from "@wildboar/ldap/src/lib/types/LDAPSyntaxEncoder";
import type { PrismaClient } from "@prisma/client";
import type { DistinguishedName } from "@wildboar/x500/src/lib/modules/InformationFramework/DistinguishedName.ta";
import type { SupplierInformation } from "@wildboar/x500/src/lib/modules/DSAOperationalAttributeTypes/SupplierInformation.ta";
import type { ConsumerInformation } from "@wildboar/x500/src/lib/modules/DSAOperationalAttributeTypes/ConsumerInformation.ta";
import type { SupplierAndConsumers } from "@wildboar/x500/src/lib/modules/DSAOperationalAttributeTypes/SupplierAndConsumers.ta";
import type { MasterAndShadowAccessPoints } from "@wildboar/x500/src/lib/modules/DistributedOperations/MasterAndShadowAccessPoints.ta";
import type { DitBridgeKnowledge } from "@wildboar/x500/src/lib/modules/DistributedOperations/DitBridgeKnowledge.ta";
import type { PrismaPromise, Prisma } from "@prisma/client";
import type { AuthenticationLevel } from "@wildboar/x500/src/lib/modules/BasicAccessControl/AuthenticationLevel.ta";
import {
    AuthenticationLevel_basicLevels,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/AuthenticationLevel-basicLevels.ta";
import {
    AuthenticationLevel_basicLevels_level_none,
} from "@wildboar/x500/src/lib/modules/BasicAccessControl/AuthenticationLevel-basicLevels-level.ta";
import type {
    NameAndOptionalUID,
} from "@wildboar/x500/src/lib/modules/SelectedAttributeTypes/NameAndOptionalUID.ta";
import type { KeyObject } from "crypto";
import type { PkiPath } from "@wildboar/x500/src/lib/modules/AuthenticationFramework/PkiPath.ta";
import type { Code } from "@wildboar/x500/src/lib/modules/CommonProtocolSpecification/Code.ta";

type EventReceiver<T> = (params: T) => void;

interface OperationalBindingControlEvents {
    on (eventName: string, fn: EventReceiver<boolean>): void;
    once (eventName: string, fn: EventReceiver<boolean>): void;
    emit (eventName: string, params: boolean): void;
}

export
type UUID = string;

export
type IndexableOID = string;

export
type LDAPName = string;

export
type ANY = ASN1Element;

export
interface LDAPSyntaxInfo {
    id: OBJECT_IDENTIFIER;
    description?: string;
    decoder?: LDAPSyntaxDecoder;
    encoder?: LDAPSyntaxEncoder;
}

export
interface AttributeInfo {
    id: OBJECT_IDENTIFIER;
    parent?: OBJECT_IDENTIFIER;
    value: {
        write: (ctx: Context, value: ASN1Element) => Promise<void>; // eslint-disable-line
        read: (ctx: Context) => Promise<ASN1Element>; // eslint-disable-line
    };

    /**
     * From ITU Recommendation X.501 (2016), Section 8.9.5:
     *
     * > Equality matching rules for attributes used for naming shall be
     * > transitive, commutative and have an assertion syntax identical to the
     * > attribute syntax.
     *
     * From ITU Recommendation X.501 (2016), Section 9.3:
     *
     * > NOTE 1 – The equality matching rule can be used because for naming
     * > attributes, the attribute syntax and the assertion syntax of the
     * > equality matching rule are the same.
     *
     * This same footnote appears in section 9.4.
     */
    namingMatcher?: EqualityMatcher;
    equalityMatcher?: EqualityMatcher;
    orderingMatcher?: OrderingMatcher;
    substringsMatcher?: SubstringsMatcher;
    approxMatcher?: EqualityMatcher;
    singleValued: boolean;
    collective: boolean;
    dummy: boolean;
    noUserModification: boolean;
    usage: AttributeUsage;
    ldapSyntax?: OBJECT_IDENTIFIER;
    ldapNames?: LDAPName[];
    ldapDescription?: string;
    obsolete: boolean;
    compatibleMatchingRules: Set<IndexableOID>;
}

export
interface ObjectClassInfo {
    id: OBJECT_IDENTIFIER;
    superclasses: Set<IndexableOID>;
    kind: ObjectClassKind;
    mandatoryAttributes: Set<IndexableOID>;
    optionalAttributes: Set<IndexableOID>;
    ldapNames?: LDAPName[];
    ldapDescription?: string;
    // The X.500 specifications do not define this field. IETF RFC 4512, Section 4.1.1 does.
    obsolete?: boolean;
}

// Still necessary, because not all object classes have OIDs.
export
interface StructuralObjectClassInfo extends ObjectClassInfo {
    kind: ObjectClassKind; // Could be structural or auxiliary. This should be validated at init.
    parent?: StructuralObjectClassInfo;
    children: StructuralObjectClassInfo[];
}

export
interface StoredContext {
    id: OBJECT_IDENTIFIER;
    fallback: boolean;
    values: ASN1Element[];
}

export
interface Value {
    // TODO: Add id field to enhance performance of deletion and replacement.
    id: AttributeType; // TODO: Rename to "type"
    value: ANY;
    contexts: Map<IndexableOID, StoredContext>;
}

export
interface DSEType {
    root: boolean;
    glue: boolean;
    cp: boolean;
    entry: boolean;
    alias: boolean;
    subr: boolean;
    nssr: boolean;
    supr: boolean;
    xr: boolean;
    admPoint: boolean;
    subentry: boolean;
    shadow: boolean;
    immSupr: boolean;
    rhob: boolean;
    sa: boolean;
    dsSubentry: boolean;
    familyMember: boolean;
    ditBridge: boolean;
}

export
interface HierarchyInfo {
    // level: number; // Shall be 0 for hierarchical top.
    // below: boolean; // Shall be computed.
    parent?: Vertex;
    // top: Vertex;
    children: Vertex[];
}

export
interface RootDSE {
    myAccessPoint: AccessPoint;
    // These are hard-coded:
    // supportedControl
    // supportedExtension
    // supportedFeatures
}

export
interface GlueDSE {
    // Intentionally empty.
}

export
interface ContextPrefixDSE {
    supplierKnowledge?: SupplierInformation[];
    consumerKnowledge?: ConsumerInformation[];
    secondaryShadows?: SupplierAndConsumers[];
}

export
interface EntryDSE {

}

export
interface AliasDSE {
    aliasedEntryName: DistinguishedName;
    // Implied to be of objectClass "alias"
}

export
interface SubordinateReferenceDSE {
    specificKnowledge: MasterAndShadowAccessPoints;
}

export
interface NonSpecificSubordinateReferenceDSE {
    nonSpecificKnowledge: MasterAndShadowAccessPoints[];
}

export
interface SuperiorReferenceDSE {
    superiorKnowledge: AccessPoint[];
}

export
interface CrossReferenceDSE {
    specificKnowledge: MasterAndShadowAccessPoints;
}

export
interface AdministrativePointDSE {
    administrativeRole: Set<IndexableOID>;
    accessControlScheme?: OBJECT_IDENTIFIER;
    subentryACI?: ACIItem[];
}

export
interface SubentryDSE {
    commonName: string;
    subtreeSpecification: SubtreeSpecification[];
    prescriptiveACI?: ACIItem[];
    collectiveAttributes?: Attribute[];
    contextAssertionDefaults?: TypeAndContextAssertion[];
    searchRules?: SearchRuleDescription[];

    // Password admin
    pwdAttribute?: OBJECT_IDENTIFIER;
    pwdModifyEntryAllowed?: BOOLEAN;
    pwdChangeAllowed?: BOOLEAN;
    pwdMaxAge?: INTEGER;
    pwdExpiryAge?: INTEGER;
    pwdMinLength?: INTEGER;
    pwdVocabulary?: BIT_STRING;
    pwdAlphabet?: string[];
    pwdDictionaries?: string[];
    pwdExpiryWarning?: INTEGER;
    pwdGraces?: INTEGER;
    pwdFailureDuration?: INTEGER;
    pwdLockoutDuration?: INTEGER;
    pwdMaxFailures?: INTEGER;
    pwdMaxTimeInHistory?: INTEGER;
    pwdMinTimeInHistory?: INTEGER;
    pwdHistorySlots?: INTEGER;
    pwdRecentlyExpiredDuration?: INTEGER;
    pwdEncAlg?: PwdEncAlg;
}

export
interface ShadowDSE {
    subordinateCompleteness: boolean;
    attributeCompleteness: boolean;
    attributeValuesIncomplete: boolean;
}

export
interface ImmediateSuperiorReferenceDSE {
    specificKnowledge: MasterAndShadowAccessPoints;
}

export
interface RelevantHierarchicalOperationalBindingDSE {
    // bindingID: number; // The specification says to store this with the DSE.
}

// sa is just a boolean
// dsSubentry is just a boolean

export
interface FamilyMemberDSE {
    parent: boolean;
    child: boolean;
}

export
interface DITBridgeDSE {
    ditBridgeKnowledge: DitBridgeKnowledge[];
}

export
interface DSE {
    id: number; // Database primary key ID.
    uuid: UUID;
    rdn: RelativeDistinguishedName;
    objectClass: Set<IndexableOID>;
    hierarchy?: HierarchyInfo;
    creatorsName?: Name;
    modifiersName?: Name;
    createdTimestamp: Date;
    modifyTimestamp: Date;
    entryACI?: ACIItem[];

    // DSE type-specific data
    root?: RootDSE;
    glue?: GlueDSE;
    cp?: ContextPrefixDSE;
    entry?: EntryDSE;
    alias?: AliasDSE;
    subr?: SubordinateReferenceDSE;
    nssr?: NonSpecificSubordinateReferenceDSE;
    supr?: SuperiorReferenceDSE;
    xr?: CrossReferenceDSE;
    admPoint?: AdministrativePointDSE;
    subentry?: SubentryDSE;
    shadow?: ShadowDSE;
    immSupr?: ImmediateSuperiorReferenceDSE;
    rhob?: RelevantHierarchicalOperationalBindingDSE;
    sa?: boolean;
    dsSubentry?: boolean;
    familyMember?: FamilyMemberDSE;
    ditBridge?: DITBridgeDSE;
}

export
interface Vertex {
    immediateSuperior?: Vertex;
    subordinates: Vertex[] | null; // null means the subordinates are stored in the database.
    /**
     * The actual contents of the DSE are very purposefully stored in a nested
     * object: it is so we can modify it by reference while still maintaining
     * the integrity of the DIT.
     */
    dse: DSE;
}

export
type DIT = Vertex;

export
interface DITInfo {
    root: DIT;
}

export
interface SigningInfo {
    key: KeyObject;
    certPath: PkiPath;
}

export
interface DSAInfo {
    /**
     * NOTE: ae-title should be taken from the signing certificate. In X.518
     * (2016), section 10.8:
     *
     * > When referring to a DSA, the access point shall have a Name, that of
     * > the DSA concerned.
     */
    accessPoint: AccessPoint;
    hibernatingSince?: Date;
    signing: SigningInfo;
}

export
interface Telemetry {
    sendEvent: (info: Record<string, any>) => void;
}

export
interface Context {
    dit: DITInfo;
    dsa: DSAInfo;
    log: typeof console;
    db: PrismaClient;
    telemetry: Telemetry;
    structuralObjectClassHierarchy: StructuralObjectClassInfo;
    objectClasses: Map<IndexableOID, ObjectClassInfo>;
    /* Note that there cannot be a single attributes hierarchy like there is
    with structural classes. */
    attributes: Map<IndexableOID, AttributeInfo>;
    ldapSyntaxes: Map<IndexableOID, LDAPSyntaxInfo>;
    equalityMatchingRules: Map<IndexableOID, EqualityMatcher>;
    orderingMatchingRules: Map<IndexableOID, OrderingMatcher>;
    substringsMatchingRules: Map<IndexableOID, SubstringsMatcher>;
    approxMatchingRules: Map<IndexableOID, EqualityMatcher>;
    contextMatchers: Map<IndexableOID, ContextMatcher>;
    /**
     * A map of connection UUIDs to a map of query references to paged results
     * requests. Query references should be 16 bytes (length of a UUID) of
     * CSPRNG-generated bytes, then encoded as a base64 `string` (so comparison
     * can happen by value rather than by reference.)
     *
     * This architecture is used because you can lop off all of the outstanding
     * requests for a particular connection when a client unbinds, and you can
     * apply limits to the number of outstanding query references per client.
     */
    pagedResultsRequests: Map<UUID, Map<string, PagedResultsRequest_newRequest>>;
    operationalBindingControlEvents: OperationalBindingControlEvents;
}

export
interface PendingUpdates {
    readonly entryUpdate: Prisma.EntryUpdateInput,
    readonly otherWrites: PrismaPromise<any>[],
}

export
type SpecialAttributeMemoryEditor = (
    ctx: Readonly<Context>,
    entry: Vertex,
    value: Value,
) => Promise<void>;

export
type SpecialAttributeDatabaseEditor = (
    ctx: Readonly<Context>,
    entry: Vertex,
    value: Value,
    pendingUpdates: PendingUpdates,
) => Promise<void>;

export
type SpecialAttributeDatabaseReader = (
    ctx: Readonly<Context>,
    entry: Vertex,
) => Promise<Value[]>;

export
type SpecialAttributeDatabaseRemover = (
    ctx: Readonly<Context>,
    entry: Vertex,
    pendingUpdates: PendingUpdates,
) => Promise<void>;

export
interface PagedResultsRequestState {
    /**
     * The original paged results request.
     */
    request: PagedResultsRequest_newRequest;

    /**
     * Note that, even though there is a `pageNumber` field in
     * `PagedResultsRequest.newRequest`, this field only indicates the page on
     * which to start; X.500 directory services don't give users the ability to
     * page backwards or randomly (and thankfully so).
     *
     * Hence, this `pageIndex` field exists so the current page number of the
     * query can be tracked.
     */
    pageIndex: number;

    /**
     * This is for implementing cursor-based pagination in Prisma.
     * See this: https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination
     */
    cursorId?: number;
}

export
interface OperationInvocationInfo {
    /**
     * From `InvokeId.present`.
     */
    invokeId: number;
    operationCode?: Code;
    startTime: Date;

    /**
     * This field exists to indicate the abandonment of an operation.
     */
    abandonTime?: Date;

    /**
     * This field exists so that AbandonError.tooLate can be used.
     */
    resultTime?: Date;
}

export
abstract class ClientConnection {
    public readonly id = randomUUID();
    public boundEntry: Vertex | undefined;
    /**
     * Even though this can be calculated from the `boundEntry` field, this
     * field exists so that the bound entry's DN does not have to be
     * repeatedly re-calculated.
     */
    public boundNameAndUID: NameAndOptionalUID | undefined;
    public authLevel: AuthenticationLevel = {
        basicLevels: new AuthenticationLevel_basicLevels(
            AuthenticationLevel_basicLevels_level_none,
            0,
            false,
        ),
    };
    public readonly pagedResultsRequests: Map<string, PagedResultsRequestState> = new Map();

    /**
     * When an operation is started, it is added to this map. When the operation
     * is abandoned, its `abandonTime` field is set with the current time. Each
     * operation independently will be responsible for checking, say, in every
     * iteration of a loop, if this field is set (which would mean that the
     * request has been abandoned).
     */
    public readonly invocations: Map<number, OperationInvocationInfo> = new Map(); // number is the InvokeId.present.
}
