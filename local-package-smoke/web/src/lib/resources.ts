export type ResourceNavigationItem = { label: string; href: string; icon: string }

export const resources: readonly ResourceNavigationItem[] = [
    { label: 'Categories', href: '/categories', icon: 'folder' },
  { label: 'Tags', href: '/tags', icon: 'price-tag' },
  { label: 'Products', href: '/products', icon: 'shopping-bag' },
// bunway:resources
] as const
