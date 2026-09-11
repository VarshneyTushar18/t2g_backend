/** Parse current_gallery from multipart/form body (admin edit form). */
export const parseCurrentGallery = (value) => {
  if (value == null || value === "") return null;

  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter(Boolean) : null;
  } catch {
    return null;
  }
};

export const withGalleryMeta = (item) => {
  if (!item) return item;
  const gallery = Array.isArray(item.gallery) ? item.gallery : [];
  return { ...item, gallery, galleryCount: gallery.length };
};
