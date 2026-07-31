/**
 * What an examination is made of. Data, and nothing else.
 *
 * <p>The test for whether a class belongs here is one question: <b>does it do something, or
 * does it only report something?</b> A class that orchestrates, causes a side effect or
 * moves state lives with the behaviour it belongs to — {@code pipeline}, {@code stage},
 * {@code service}. A class that only holds fields and answers questions about them lives
 * here, even if it is an enum with helpers: {@link com.tb.helix.lccheck.types.pipeline.StageId} knows
 * which stage follows it, and that is self-description, not orchestration.
 *
 * <p>Sub-packages mirror the behaviour side by name, so navigation is symmetric in both
 * directions: {@code pipeline/} ↔ {@code types/pipeline}, and the reading and examining
 * vocabularies get {@code types/document} and {@code types/examination}.
 *
 * <p>Three things that look like types and are not:
 *
 * <ul>
 *   <li><b>Wire formats</b> live in {@code api/dto}. A request body is shaped by the HTTP
 *       API's history and compatibility promises; a type is shaped by the business. Merging
 *       them means an API version bump edits the domain.
 *   <li><b>Rows</b> stay in {@code persistence}. Column names are the schema's business.
 *   <li><b>Exceptions</b> live in {@code infra.error}. They carry behaviour — each knows its
 *       own status — and they are not part of any module's vocabulary.
 * </ul>
 *
 * <p>Nothing here may depend on {@code service}, {@code stage}, {@code pipeline} or
 * {@code persistence}, and nothing here carries a framework annotation. Both are enforced in
 * {@code ArchitectureTest}, because a type that grows a {@code @Component} has stopped being
 * a type and nobody notices until it is load-bearing.
 */
package com.tb.helix.lccheck.types;
