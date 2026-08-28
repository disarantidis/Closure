# Plugin Backlog

## Minor Priority

### Math Expressions in Core Dimension Tokens
**Status**: Backlog (Minor)
**Added**: 2026-04-08

**Issue**: Token Studio exports dimension tokens with math expressions like `1*{dimension.base}`, but Figma resolves these to computed values (e.g., `4`) when imported. The original expressions are lost.

**Example**:
- Token Studio: `"value": "1*{dimension.base}"`
- Figma/Plugin: `"value": "4"`

**Impact**: Low - Values are mathematically correct, just missing the expression syntax.

**Potential Solutions**:
1. Store expressions in variable descriptions (requires manual setup)
2. Create a sidecar JSON file with expression mappings
3. Use a naming convention to infer expressions (e.g., `dimension.1` = `1*{dimension.base}`)

**Note**: This is a limitation of Figma's variable API, not the plugin. Figma computes expressions during import and only stores resolved values.

---

## Related docs

- `README.md` — product overview.
- `TOKEN_STUDIO_TYPOGRAPHY.md` — typography parity details.
- `THEMING.md` — plugin UI theming.
