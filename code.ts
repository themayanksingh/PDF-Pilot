figma.showUI(__html__, { width: 360, height: 420, themeColors: true });

function getSelectedFrames(): { id: string; name: string; width: number; height: number }[] {
  return figma.currentPage.selection
    .filter(node => node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE')
    .map(node => ({
      id: node.id,
      name: node.name,
      width: Math.round(node.width),
      height: Math.round(node.height),
    }));
}

function sendSelection() {
  figma.ui.postMessage({ type: 'selection-update', frames: getSelectedFrames() });
}

figma.on('selectionchange', sendSelection);

figma.ui.onmessage = async (msg: { type: string; scale?: number }) => {
  if (msg.type === 'init') {
    sendSelection();
  }

  if (msg.type === 'export') {
    const scale = msg.scale || 2;
    const frames = figma.currentPage.selection.filter(
      node => node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE'
    );

    if (frames.length === 0) {
      figma.notify('No frames selected');
      return;
    }

    const images: string[] = [];
    for (const frame of frames) {
      const bytes = await (frame as FrameNode).exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: scale },
      });
      const base64 = 'data:image/png;base64,' + figma.base64Encode(bytes);
      images.push(base64);
    }

    figma.ui.postMessage({ type: 'export-data', images });
  }

  if (msg.type === 'export-done') {
    figma.notify('PDF exported successfully! ✅');
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};
