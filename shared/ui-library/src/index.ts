// Utilities
export { cn } from "./lib/utils";

// Alert
export { Alert, alertVariants } from "./Alert";
export type { AlertProps } from "./Alert";

// Button
export { Button, buttonVariants } from "./Button";
export type { ButtonProps } from "./Button";

// LinkButton
export { LinkButton, linkButtonVariants } from "./LinkButton";
export type { LinkButtonProps } from "./LinkButton";

// ThemeToggle
export { ThemeToggle, themeToggleVariants } from "./ThemeToggle";
export type { ThemeToggleProps } from "./ThemeToggle";

// Navigation
export { NavLinks, navLinksVariants } from "./NavLinks";
export type { NavLinksProps, NavigationItem } from "./NavLinks";

// Layout
export { WavyDivider } from "./WavyDivider";
export type { WavyDividerProps } from "./WavyDivider";
export { AnimatedWaveDivider } from "./AnimatedWaveDivider";
export type { AnimatedWaveDividerProps } from "./AnimatedWaveDivider";
export { PresentationLayout } from "./PresentationLayout";
export type { PresentationLayoutProps } from "./PresentationLayout";

// Social
export { SocialLinks } from "./SocialLinks";
export type { SocialLinksProps, SocialLink } from "./SocialLinks";

// Footer
export { FooterContent } from "./FooterContent";
export type { FooterContentProps } from "./FooterContent";

// Header
export { Header } from "./Header";
export type { HeaderProps, CTAConfig } from "./Header";
export { Logo, logoVariants } from "./Logo";
export type { LogoProps } from "./Logo";

// Prose
export { ProseContent } from "./ProseContent";
export type { ProseContentProps } from "./ProseContent";
export { ProseHeading, proseHeadingVariants } from "./ProseHeading";
export type { ProseHeadingProps, HeadingLevel } from "./ProseHeading";

// Card components
export { Card, cardVariants } from "./Card";
export type { CardProps, CardVariant } from "./Card";
export { CardImage, cardImageVariants } from "./CardImage";
export type { CardImageProps, CardImageSize } from "./CardImage";

// Cover image
export { CoverImage } from "./CoverImage";
export type { CoverImageProps } from "./CoverImage";
export { CardTitle } from "./CardTitle";
export type { CardTitleProps } from "./CardTitle";
export { CardMetadata } from "./CardMetadata";
export type { CardMetadataProps } from "./CardMetadata";

// Empty state
export { EmptyState } from "./EmptyState";
export type { EmptyStateProps } from "./EmptyState";

// List page
export { ListPageHeader } from "./ListPageHeader";
export type { ListPageHeaderProps } from "./ListPageHeader";

// Date formatting
export { formatDate } from "./utils/formatDate";
export type { FormatDateOptions, DateFormatStyle } from "./utils/formatDate";

// Tags
export { TagsList, tagVariants } from "./TagsList";
export type { TagsListProps } from "./TagsList";

// Back link
export { BackLink } from "./BackLink";
export type { BackLinkProps } from "./BackLink";

// Detail page
export { DetailPageHeader, detailPageHeaderVariants } from "./DetailPageHeader";
export type { DetailPageHeaderProps } from "./DetailPageHeader";

// Stats
export { StatBadge, statBadgeVariants } from "./StatBadge";
export type { StatBadgeProps } from "./StatBadge";
export { StatBox } from "./StatBox";
export type { StatBoxProps } from "./StatBox";

// Source reference
export { SourceReferenceCard } from "./SourceReferenceCard";
export type { SourceReferenceCardProps } from "./SourceReferenceCard";

// Entry card
export { EntryCard } from "./EntryCard";
export type { EntryCardProps } from "./EntryCard";

// Status badge
export { StatusBadge, statusBadgeVariants } from "./StatusBadge";
export type { StatusBadgeProps } from "./StatusBadge";

// Content list
export { ContentListItem } from "./ContentListItem";
export type { ContentListItemProps, SeriesInfo } from "./ContentListItem";
export { ContentSection } from "./ContentSection";
export type { ContentSectionProps, ContentItem } from "./ContentSection";

// Head management
export { HeadProvider, Head, useHead, HeadContext } from "./Head";
export type {
  HeadProps,
  HeadProviderProps,
  HeadCollectorInterface,
} from "./Head";

// Pagination
export { Pagination } from "./Pagination";
export type { PaginationProps } from "./Pagination";

// Breadcrumb
export { Breadcrumb } from "./Breadcrumb";
export type { BreadcrumbProps, BreadcrumbItem } from "./Breadcrumb";

// Newsletter
export { NewsletterSignup, newsletterSignupVariants } from "./NewsletterSignup";
export type { NewsletterSignupProps } from "./NewsletterSignup";

// Widget renderers for dashboard
export { StatsWidget, ListWidget, CustomWidget } from "./widgets";
export type {
  BaseWidgetProps,
  StatsWidgetProps,
  ListWidgetProps,
  CustomWidgetProps,
} from "./widgets";
