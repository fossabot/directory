import type { AttributeInfo } from "../types";
import type {
    ATTRIBUTE,
} from "@wildboar/x500/src/lib/modules/InformationFramework/ATTRIBUTE.oca";
import {
    AttributeUsage_userApplications,
} from "@wildboar/x500/src/lib/modules/InformationFramework/AttributeUsage.ta";

export
function attributeFromInformationObject (io: ATTRIBUTE): AttributeInfo {
    return {
        id: io["&id"],
        parent: io["&derivation"]?.["&id"],
        // equalityMatcher?: EqualityMatcher;
        // orderingMatcher?: OrderingMatcher;
        // substringsMatcher?: SubstringsMatcher;
        singleValued: io["&single-valued"] ?? false,
        collective: io["&collective"] ?? false,
        dummy: io["&dummy"] ?? false,
        noUserModification: io["&no-user-modification"] ?? false,
        obsolete: io["&obsolete"] ?? false,
        usage: io["&usage"] ?? AttributeUsage_userApplications,
        ldapSyntax: io["&ldapSyntax"],
        ldapNames: io["&ldapName"],
        ldapDescription: io["&ldapDesc"],
        compatibleMatchingRules: new Set(),
    };
}

export default attributeFromInformationObject;
