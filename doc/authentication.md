# Authentication

Meerkat DSA only supports simple authentication (meaning authentication with a
password) in DAP, LDAP, DSP, and DOP, though a future version will support
strong authentication (authentication using X.509 certificate and asymmetric
cryptography), and SASL and SPKM might be supported. These other authentication
schemes may only be made available in paid versions; simple authentication will
always be available with the free edition of Meerkat DSA.

## Anonymous Authentication

Users of Meerkat DSA may bind anonymously by supplying no password. If this is
used, authentication will always succeed, even if the bound distinguished name
does not correspond to any real entry present and even if the entry _does_ exist
and has a password. This behavior is to avoid information disclosure.

> NOTE: If Meerkat DSA did not do this, it would be possible for a nefarious
> actor to enumerate the entries in a DSA, despite access controls, by guessing
> distinguished names in the bind operation and seeing which attempts come back
> with errors saying "entry does not exist" and which come back with "invalid
> password." This is the same reason that websites with logins must give you the
> same error message, regardless of whether you got the username or password
> wrong.

When users are bound anonymously, they may perform operations against Meerkat
DSA. It is the responsibility of administrators to configure access controls to
prevent anonymous users from doing things they should not be able to do.

Currently, anonymous usage can only be prevented by access control, but a future
feature will enable administrators to reject all anonymous traffic.

## How Meerkat DSA Handles Passwords

In the X.500 specifications, there is no specified attribute that is expected to
serve as the authoritative source of the password for an entry. Each DSA may
choose to use a different attribute type to store password information; in fact,
passwords might not even be stored in entries at all! This is why the
`administerPassword` and `changePassword` operations were introduced to the
Directory Access Protocol (DAP).

In Meerkat DSA, both the `userPassword` attribute (specified in
[ITU Recommendation X.509](https://www.itu.int/rec/T-REC-X.509/en)) and the
`userPwd` attribute (specified in
[ITU Recommendation X.520](https://www.itu.int/rec/T-REC-X.520/en)) are used.
However, regardless of any access controls, whenever these values are read, they
return empty strings. This is because passwords are extremely sensitive, and
let's face it: people re-use passwords between services. To prevent
administrators from misconfiguring Meerkat DSA and leaking all of their users'
passwords, the passwords are simply never returned, even if queried directly,
and even if access controls permit it. An empty string is returned as the value
so that directory users can at least know _if_ an entry has a password. In other
words, passwords are _write-only_ in Meerkat DSA.

The password is stored in the database. If password is supplied using cleartext,
it will be salted and hashed using the Scrypt algorithm and stored in the
database. If the password is already encrypted / hashed, it will be stored using
the algorithm that was used to encrypt it.

## How to Change Passwords

It is recommended to use the `administerPassword` and/or `changePassword`
operations to modify an entry's password.

## Password Policy

Password policy, as specified in
[ITU Recommendation X.509](https://www.itu.int/rec/T-REC-X.509/en) is not
currently supported. Future editions of Meerkat DSA will support X.509 Password
Policies, though there may only be a subset of these features available for the
free edition of Meerkat DSA (which is not to imply that _all_ of these features
will be available in the paid version).

## Request Signatures

Request signatures are not currently validated, but will be in future versions
of Meerkat DSA.

## Architectural Details

You might notice that it can take a few seconds to authenticate to Meerkat DSA.
This is no accident.

Authentication is protected against
[timing attacks](https://ropesec.com/articles/timing-attacks/) by response time
randomization and constant-time string comparison. (These two methods may seem
to contradict each other, and you'd be right to point that out; however, both
are used so that, if one does not work, the other will.) By default, Meerkat DSA
always waits one second, but potentially up to two seconds, before responding
with an authentication result. Response time randomization can be configured by administrators via the `MEERKAT_BIND_MIN_SLEEP_MS`
and `MEERKAT_BIND_SLEEP_RANGE_MS` environment variables.

Notably, Meerkat DSA does not sleep for a random amount of time, perform the
credential evaluation, then return a result; it performs a credential evaluation
then waits the remaining amount of time such that the randomly-selected sleep
time has passed. If the former methodology were used, nefarious actors could
still perform a timing attack by attempting authentication many times to see
which attempts take the longest response time on average.
