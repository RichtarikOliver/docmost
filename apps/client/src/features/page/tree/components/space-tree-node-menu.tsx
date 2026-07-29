import { useState } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { ActionIcon, Menu, rem } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconArrowRight,
  IconCopy,
  IconDotsVertical,
  IconFileExport,
  IconLink,
  IconSortAscendingLetters,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";

import ExportModal from "@/components/common/export-modal";
import MovePageModal from "@/features/page/components/move-page-modal.tsx";
import CopyPageModal from "@/features/page/components/copy-page-modal.tsx";
import { useDeletePageModal } from "@/features/page/hooks/use-delete-page-modal.tsx";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { getPageTitle } from "@/features/page/page.utils";
import { duplicatePage, movePage } from "@/features/page/services/page-service.ts";
import { useClipboard } from "@/hooks/use-clipboard";
import { getAppUrl } from "@/lib/config.ts";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import {
  useFavoriteIds,
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from "@/features/favorite/queries/favorite-query";

import { treeDataAtom } from "@/features/page/tree/atoms/tree-data-atom.ts";
import { treeModel } from "@/features/page/tree/model/tree-model";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import { fetchAllAncestorChildren } from "@/features/page/queries/page-query.ts";
import type { SpaceTreeNode } from "@/features/page/tree/types.ts";
import classes from "@/features/page/tree/styles/tree.module.css";

export interface NodeMenuProps {
  node: SpaceTreeNode;
  canEdit: boolean;
}

export function NodeMenu({ node, canEdit }: NodeMenuProps) {
  const { t } = useTranslation();
  const clipboard = useClipboard({ timeout: 500 });
  const { spaceSlug } = useParams();
  const { openDeleteModal } = useDeletePageModal();
  const { handleDelete } = useTreeMutation(node.spaceId);
  const [data, setData] = useAtom(treeDataAtom);
  const emit = useQueryEmit();
  const [isSorting, setIsSorting] = useState(false);
  const [exportOpened, { open: openExportModal, close: closeExportModal }] =
    useDisclosure(false);
  const [
    movePageModalOpened,
    { open: openMovePageModal, close: closeMoveSpaceModal },
  ] = useDisclosure(false);
  const [
    copyPageModalOpened,
    { open: openCopyPageModal, close: closeCopySpaceModal },
  ] = useDisclosure(false);
  const favoriteIds = useFavoriteIds("page", node.spaceId);
  const addFavorite = useAddFavoriteMutation();
  const removeFavorite = useRemoveFavoriteMutation();
  const isFavorited = favoriteIds.has(node.id);

  const handleCopyLink = () => {
    const pageUrl =
      getAppUrl() + buildPageUrl(spaceSlug, node.slugId, node.name);
    clipboard.copy(pageUrl);
    notifications.show({ message: t("Link copied") });
  };

  const handleDuplicatePage = async () => {
    try {
      const duplicatedPage = await duplicatePage({ pageId: node.id });

      // figure out parent + insertion index
      const siblings = treeModel.siblingsOf(data, node.id);
      const parentId = siblings?.parentId ?? null;
      const currentIndex = siblings?.index ?? 0;
      const newIndex = currentIndex + 1;

      const treeNodeData: SpaceTreeNode = {
        id: duplicatedPage.id,
        slugId: duplicatedPage.slugId,
        name: duplicatedPage.title,
        position: duplicatedPage.position,
        spaceId: duplicatedPage.spaceId,
        parentPageId: duplicatedPage.parentPageId,
        icon: duplicatedPage.icon,
        hasChildren: duplicatedPage.hasChildren,
        canEdit: true,
        children: [],
      };

      setData((prev) =>
        treeModel.insert(prev, parentId, treeNodeData, newIndex),
      );

      setTimeout(() => {
        emit({
          operation: "addTreeNode",
          spaceId: node.spaceId,
          payload: {
            parentId,
            index: newIndex,
            data: treeNodeData,
          },
        });
      }, 50);

      notifications.show({ message: t("Page duplicated successfully") });
    } catch (err: any) {
      notifications.show({
        message: err?.response?.data?.message || "An error occurred",
        color: "red",
      });
    }
  };

  const handleSortSubpages = async () => {
    if (isSorting) return;
    setIsSorting(true);
    try {
      // Get children from atom, fetch from backend if not yet loaded
      let children = (treeModel.find(data, node.id) as SpaceTreeNode | null)?.children as SpaceTreeNode[] | undefined;
      if (!children || children.length === 0) {
        children = (await fetchAllAncestorChildren({
          pageId: node.id,
          spaceId: node.spaceId,
        })) as SpaceTreeNode[];
      }
      if (!children || children.length < 2) return;

      const sorted = [...children].sort((a, b) =>
        (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
      );

      let prevPos: string | null = null;
      const newPositions: { id: string; position: string }[] = [];
      for (const child of sorted) {
        const position = generateJitteredKeyBetween(prevPos, null);
        newPositions.push({ id: child.id, position });
        prevPos = position;
      }

      await Promise.all(
        newPositions.map(({ id, position }) =>
          movePage({ pageId: id, parentPageId: node.id, position }),
        ),
      );

      // Update atom: replace children of this node with sorted+repositioned list
      setData((prev) => {
        const replaceChildren = (nodes: SpaceTreeNode[]): SpaceTreeNode[] =>
          nodes.map((n) => {
            if (n.id === node.id) {
              const updatedChildren = sorted.map((child, i) => ({
                ...child,
                position: newPositions[i].position,
              }));
              return { ...n, children: updatedChildren };
            }
            if (n.children?.length) {
              return { ...n, children: replaceChildren(n.children as SpaceTreeNode[]) };
            }
            return n;
          });
        return replaceChildren(prev);
      });

      notifications.show({ message: t("Subpages sorted alphabetically") });
    } catch {
      notifications.show({ message: t("Failed to sort subpages"), color: "red" });
    } finally {
      setIsSorting(false);
    }
  };

  return (
    <>
      <Menu shadow="md" width={200}>
        <Menu.Target>
          <ActionIcon
            variant="subtle"
            color="gray"
            className={classes.actionIcon}
            aria-label={t("Page menu for {{name}}", { name: getPageTitle(node.name, node.isBase, t) })}
            tabIndex={-1}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <IconDotsVertical
              style={{ width: rem(20), height: rem(20) }}
              stroke={2}
            />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconLink size={16} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCopyLink();
            }}
          >
            {t("Copy link")}
          </Menu.Item>

          <Menu.Item
            leftSection={
              isFavorited ? <IconStarFilled size={16} /> : <IconStar size={16} />
            }
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isFavorited) {
                removeFavorite.mutate({ type: "page", pageId: node.id });
              } else {
                addFavorite.mutate({ type: "page", pageId: node.id });
              }
            }}
          >
            {isFavorited ? t("Remove from favorites") : t("Add to favorites")}
          </Menu.Item>

          <Menu.Item
            leftSection={<IconFileExport size={16} />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openExportModal();
            }}
          >
            {t("Export page")}
          </Menu.Item>

          {canEdit && (
            <>
              <Menu.Item
                leftSection={<IconCopy size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleDuplicatePage();
                }}
              >
                {t("Duplicate")}
              </Menu.Item>

              <Menu.Item
                leftSection={<IconArrowRight size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openMovePageModal();
                }}
              >
                {t("Move")}
              </Menu.Item>

              {node.hasChildren && (
                <Menu.Item
                  leftSection={<IconSortAscendingLetters size={16} />}
                  disabled={isSorting}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleSortSubpages();
                  }}
                >
                  {isSorting ? t("Sorting…") : t("Sort subpages A→Z")}
                </Menu.Item>
              )}

              <Menu.Item
                leftSection={<IconCopy size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openCopyPageModal();
                }}
              >
                {t("Copy to space")}
              </Menu.Item>

              <Menu.Divider />
              <Menu.Item
                c="red"
                leftSection={<IconTrash size={16} />}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openDeleteModal({
                    onConfirm: () => handleDelete(node.id),
                  });
                }}
              >
                {t("Move to trash")}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      <MovePageModal
        pageId={node.id}
        slugId={node.slugId}
        currentSpaceSlug={spaceSlug}
        onClose={closeMoveSpaceModal}
        open={movePageModalOpened}
      />

      <CopyPageModal
        pageId={node.id}
        currentSpaceSlug={spaceSlug}
        onClose={closeCopySpaceModal}
        open={copyPageModalOpened}
      />

      <ExportModal
        type="page"
        id={node.id}
        open={exportOpened}
        onClose={closeExportModal}
      />
    </>
  );
}
