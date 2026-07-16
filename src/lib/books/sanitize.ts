import sanitizeHtml from "sanitize-html";

export function sanitizeEpubHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["article", "section", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "span", "strong", "em", "b", "i", "u", "s", "small", "sup", "sub", "ol", "ul", "li", "blockquote", "figure", "figcaption", "a", "br", "hr", "code", "pre"],
    allowedAttributes: { a: ["href", "title"], "*": ["id", "lang", "dir", "role", "epub:type"] },
    allowedSchemes: ["#"],
    allowProtocolRelative: false,
    transformTags: { a: (_tag, attrs) => ({ tagName: "a", attribs: attrs.href?.startsWith("#") ? attrs : { title: attrs.title ?? "External link removed" } }) }
  });
}

export function isSafeArchivePath(path: string) {
  if (!path || path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path)) return false;
  const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return !normalized.split("/").some((part) => part === ".." || part === "");
}
