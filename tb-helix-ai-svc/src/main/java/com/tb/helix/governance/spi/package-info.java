/**
 * What governance offers other modules, in process.
 *
 * <p>SPI in its original Java sense — the interface a <em>provider</em> publishes and
 * implements, which a consumer calls. (JDBC's {@code Driver}, {@code ServiceLoader}.) Not
 * the inverted sense some layouts use, where {@code spi} holds contracts a module needs
 * <em>from</em> elsewhere; those are {@code port} packages here, and the distinction is the
 * whole point: an import from {@code governance.spi} is a call out to another module, an
 * import from a {@code port} package is a call back in.
 *
 * <p><b>Why the contract lives here and not in lc-check.</b> The usual advice is that the
 * consumer owns the interface and the supplier writes an adapter for it. That would make
 * governance depend on lc-check, which is the one direction this codebase forbids —
 * governance authors rules and has no business knowing they get executed. So governance is
 * the upstream that publishes a shaped API instead: DDD's <b>Open Host Service</b>, which
 * is the right pattern precisely when the supplier must stay ignorant of its consumers.
 *
 * <p>What that costs, honestly: the contract is shaped by what an examination needs
 * ({@code CheckCard} is flattened for exactly that), so a second consumer with different
 * needs would either widen it or want its own. If that day comes, the answer is a second
 * interface here, not a general one.
 *
 * <p>What it buys: the seam is already the extraction boundary. Today the implementation
 * reads the same database; tomorrow it could make an HTTP call, and no stage would change.
 */
package com.tb.helix.governance.spi;
