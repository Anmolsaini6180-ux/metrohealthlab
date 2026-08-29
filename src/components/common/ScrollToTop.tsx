import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

// React Router keeps the window scroll offset across navigations, so
// opening a package from halfway down the home page used to land you
// halfway down the package page. This resets it — but only for genuine
// forward navigation.
//
// A POP (browser back/forward) is left alone: the browser has already
// restored the previous offset itself, and overriding that is the exact
// "hack that breaks back/forward" worth avoiding. A REPLACE is also left
// alone, since replacing the entry (e.g. a filter written into the query
// string) is not a new page from the reader's point of view.
export default function ScrollToTop() {
  const { pathname } = useLocation();
  const navigationType = useNavigationType();

  useEffect(() => {
    if (navigationType !== "PUSH") return;

    // An in-page anchor target wins over the reset, so /page#section
    // still works.
    if (window.location.hash) {
      const target = document.querySelector(window.location.hash);
      if (target) {
        target.scrollIntoView();
        return;
      }
    }

    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, navigationType]);

  return null;
}
