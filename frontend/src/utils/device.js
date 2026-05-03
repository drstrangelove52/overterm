export const isMobile =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) &&
  !localStorage.getItem("overterm-force-desktop");
