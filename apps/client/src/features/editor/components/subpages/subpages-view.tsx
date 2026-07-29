import { NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import {
  Stack,
  Text,
  Anchor,
  ActionIcon,
  TextInput,
  UnstyledButton,
  Loader,
  Group,
  Paper,
} from "@mantine/core";
import {
  IconFileDescription,
  IconSearch,
  IconEdit,
} from "@tabler/icons-react";
import { useGetSidebarPagesQuery } from "@/features/page/queries/page-query";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import classes from "./subpages.module.css";
import styles from "../mention/mention.module.css";
import {
  buildPageUrl,
  buildSharedPageUrl,
} from "@/features/page/page.utils.ts";
import { useTranslation } from "react-i18next";
import { sortPositionKeys } from "@/features/page/tree/utils/utils";
import { useSharedPageSubpages } from "@/features/share/hooks/use-shared-page-subpages";
import { useSearchSuggestionsQuery } from "@/features/search/queries/search-query";
import { useDebouncedValue } from "@mantine/hooks";
import { LabelChip } from "@/features/label/components/label-chip";

export default function SubpagesView(props: NodeViewProps) {
  const { editor, node, updateAttributes } = props;
  const { spaceSlug, shareId } = useParams();
  const { t } = useTranslation();

  //@ts-ignore
  const currentPageId = editor.storage.pageId;
  const { targetPageId, targetPageTitle } = node.attrs;

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery] = useDebouncedValue(searchQuery, 300);

  const showPicker = !targetPageId && editor.isEditable && !shareId;

  const { data: searchData, isLoading: searchLoading } =
    useSearchSuggestionsQuery({
      query: debouncedQuery || "",
      includePages: true,
      limit: 10,
    });

  const sharedSubpages = useSharedPageSubpages(currentPageId);

  const { data, isLoading, error } = useGetSidebarPagesQuery(
    shareId || !targetPageId ? null : { pageId: targetPageId },
  );

  const subpages = useMemo(() => {
    if (shareId && sharedSubpages) {
      return sharedSubpages.map((node) => ({
        id: node.value,
        slugId: node.slugId,
        title: node.name,
        icon: node.icon,
        position: node.position,
        labels: [] as { id: string; name: string }[],
      }));
    }
    if (!data?.pages) return [];
    const allPages = data.pages.flatMap((page) => page.items);
    return sortPositionKeys(allPages);
  }, [data, shareId, sharedSubpages]);

  const handlePageSelect = (page: {
    id: string;
    title?: string;
    slugId?: string;
  }) => {
    updateAttributes({
      targetPageId: page.id,
      targetPageTitle: page.title || t("Untitled"),
    });
    setSearchQuery("");
  };

  const handleChangePage = () => {
    updateAttributes({ targetPageId: null, targetPageTitle: null });
    setSearchQuery("");
  };

  if (showPicker) {
    return (
      <NodeViewWrapper data-drag-handle>
        <div className={classes.container}>
          <Text size="sm" c="dimmed" mb="xs">
            {t("Select a page to display its subpages:")}
          </Text>
          <TextInput
            leftSection={<IconSearch size={14} />}
            placeholder={t("Search pages...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.currentTarget.value)}
            size="sm"
            autoFocus
          />
          {debouncedQuery && (
            <Paper withBorder mt={4} p="xs" radius="sm">
              {searchLoading ? (
                <Group justify="center" py="xs">
                  <Loader size="xs" />
                </Group>
              ) : searchData?.pages && searchData.pages.length > 0 ? (
                <Stack gap={2}>
                  {searchData.pages.map((page) => (
                    <UnstyledButton
                      key={page.id}
                      className={styles.menuBtn}
                      onClick={() => handlePageSelect(page)}
                      px="xs"
                      py={4}
                    >
                      <Group gap="xs" wrap="nowrap">
                        <ActionIcon
                          variant="transparent"
                          c="gray"
                          size={18}
                          component="span"
                        >
                          {page.icon ? (
                            <span>{page.icon}</span>
                          ) : (
                            <IconFileDescription size={16} />
                          )}
                        </ActionIcon>
                        <Text size="sm" truncate style={{ flex: 1 }}>
                          {page.title || t("Untitled")}
                        </Text>
                        {page.space && (
                          <Text size="xs" c="dimmed" truncate>
                            {(page.space as { name?: string }).name}
                          </Text>
                        )}
                      </Group>
                    </UnstyledButton>
                  ))}
                </Stack>
              ) : (
                <Text size="sm" c="dimmed">
                  {t("No results found")}
                </Text>
              )}
            </Paper>
          )}
        </div>
      </NodeViewWrapper>
    );
  }

  if (!targetPageId && !editor.isEditable) {
    return (
      <NodeViewWrapper data-drag-handle>
        <div className={classes.container}>
          <Text c="dimmed" size="md" py="md">
            {t("No page selected")}
          </Text>
        </div>
      </NodeViewWrapper>
    );
  }

  if (isLoading && !shareId) {
    return null;
  }

  if (error && !shareId) {
    return (
      <NodeViewWrapper data-drag-handle>
        <Text c="dimmed" size="md" py="md">
          {t("Failed to load subpages")}
        </Text>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-drag-handle>
      <div className={classes.container}>
        {targetPageId && editor.isEditable && (
          <Group justify="space-between" mb={4}>
            <Text size="xs" c="dimmed">
              {t("Subpages of")}: {targetPageTitle}
            </Text>
            <UnstyledButton onClick={handleChangePage}>
              <Group gap={4}>
                <IconEdit size={12} />
                <Text size="xs" c="blue">
                  {t("Change")}
                </Text>
              </Group>
            </UnstyledButton>
          </Group>
        )}
        {subpages.length === 0 ? (
          <Text c="dimmed" size="md" py="md">
            {t("No subpages")}
          </Text>
        ) : (
          <Stack gap={5}>
            {subpages.map((page) => (
              <Group key={page.id} gap={6} wrap="nowrap" align="center">
                {page?.icon ? (
                  <span style={{ flexShrink: 0, fontSize: "1em" }}>
                    {page.icon}
                  </span>
                ) : (
                  <ActionIcon
                    variant="transparent"
                    color="gray"
                    component="span"
                    size={18}
                    style={{ flexShrink: 0 }}
                  >
                    <IconFileDescription size={18} />
                  </ActionIcon>
                )}

                <Anchor
                  component={Link}
                  fw={500}
                  to={
                    shareId
                      ? buildSharedPageUrl({
                          shareId,
                          pageSlugId: page.slugId,
                          pageTitle: page.title,
                        })
                      : buildPageUrl(spaceSlug, page.slugId, page.title)
                  }
                  underline="hover"
                  draggable={false}
                  style={{ flexShrink: 0 }}
                >
                  {page?.title || t("untitled")}
                </Anchor>

                {(page as any).labels?.map(
                  (label: { id: string; name: string }) => (
                    <LabelChip key={label.id} label={label} />
                  ),
                )}
              </Group>
            ))}
          </Stack>
        )}
      </div>
    </NodeViewWrapper>
  );
}
