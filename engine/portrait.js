//PORTRAIT LAYOUT
//Used by Render() instead of the landscape field layout when the window is taller than it is wide (e.g. phones held upright).
//The corp's servers wrap into rows (centrals first, then scored area, remotes and the new remote slot) and the runner's
//rig sits in rows above their identity, stack and heap, so the board fills a tall screen instead of shrinking to fit its width.
//As in landscape, the layout is in field coordinates with the corp at the top; viewing as corp rotates the whole stage.

function IsPortraitLayout() {
  return window.innerHeight > window.innerWidth;
}

//clear per-render server geometry so landscape falls back to its original behaviour
function ResetServerGeometry() {
  var servers = [corp.archives, corp.RnD, corp.HQ].concat(corp.remoteServers);
  for (var i = 0; i < servers.length; i++) {
    servers[i].yStart = undefined;
    servers[i].yEnd = undefined;
    servers[i].yCentre = undefined;
    servers[i].selectorScaleY = undefined;
  }
  corp.newRemoteSlot = null;
}

//true if y is within the server's row (always true when rows aren't in use)
function InServerRow(server, y) {
  if (typeof server.yStart === "undefined") return true;
  return y >= server.yStart && y <= server.yEnd;
}

//L contains the cascades built in Render(). Returns the screen size in field units and where to put the counters.
function ApplyPortraitLayout(L) {
  var corpView = viewingPlayer == corp;
  var hostingX = L.hostingX;

  //HUD is drawn at its natural size in portrait (mobile.css sizes it), so measure it to keep cards clear of it
  $("#footer, #header, #menubar, #history-wrapper, .historycontents").css("transform", "none");
  $("#history-wrapper").css({ width: "", top: "" });
  $("#history").css("width", "");
  $(".historyentry").css({ height: "", width: "" });
  var hudTop = Math.max($("#menubar").outerHeight() || 0, $("#header").outerHeight() || 0);
  var hudBottom = $("#footer").outerHeight() || 0;
  var hudSide = $("#history-wrapper").is(":visible") ? $("#history-wrapper").outerWidth() || 0 : 0;
  //the stage is rotated 180 degrees for the corp, so screen edges swap in field coordinates
  var resTop = corpView ? hudBottom : hudTop;
  var resBottom = corpView ? hudTop : hudBottom;
  var resLeft = corpView ? hudSide : 0;
  var resRight = corpView ? 0 : hudSide;

  var gap = 30; //between servers and between rows
  var handZone = 180; //space for the viewing player's hand (most of each card visible)
  var peekZone = 40; //space for the opponent's hand (just the edge of the cards shows)
  var counterRow = 50;
  var minFieldWidth = 540;

  //SERVER ROWS
  var central = [
    { server: corp.archives, root: L.archivesRoot, cards: L.archivesCards, ice: L.archivesIce, width: L.archivesWidth, faceDownOffset: 5 },
    { server: corp.RnD, root: L.RnDRoot, cards: L.RnDCards, ice: L.RnDIce, width: L.RnDWidth },
    { server: corp.HQ, root: L.HQRoot, cards: L.HQCards, ice: L.HQIce, width: L.HQWidth },
  ];
  var others = [];
  if (L.scored.cards.length > 0) others.push({ scored: true, width: Math.max(L.scored.width, 150) });
  for (var i = 0; i < L.remoteCascades.length; i++) {
    var rc = L.remoteCascades[i];
    others.push({ server: corp.remoteServers[i], root: null, cards: rc.cards, ice: rc.ice, width: Math.max(rc.width, 150) });
  }
  others.push({ newRemote: true, width: 210 });

  function rowWidth(row) {
    var total = 0;
    for (var i = 0; i < row.length; i++) total += row[i].width;
    return total + gap * (row.length - 1);
  }
  var fieldWidth = Math.max(minFieldWidth, rowWidth(central));

  //runner rows (rig rows can't wrap so they may widen the field)
  var stolenW = L.stolen.cards.length > 0 ? L.stolen.width + gap : 0;
  var baseRowWidth = L.identity.width + stolenW + gap + L.stack.width + gap + L.heap.width;
  fieldWidth = Math.max(fieldWidth, baseRowWidth, L.programs.width, L.hardware.width, L.resources.width);

  //pack scored area, remotes and the new remote slot into rows that fit the field width
  var rows = [central];
  var current = [];
  for (var i = 0; i < others.length; i++) {
    if (current.length > 0 && rowWidth(current.concat([others[i]])) > fieldWidth) {
      rows.push(current);
      current = [];
    }
    current.push(others[i]);
  }
  rows.push(current);

  //measure rows
  var rowGeometry = [];
  var serversHeight = 0;
  for (var r = 0; r < rows.length; r++) {
    var rootH = 0;
    var cardsH = 150; //at least one card's worth so empty servers still have a target
    var iceH = 0;
    for (var i = 0; i < rows[r].length; i++) {
      var col = rows[r][i];
      if (col.root && col.root.cards.length > 0) rootH = Math.max(rootH, col.root.height + 10);
      if (col.cards) cardsH = Math.max(cardsH, col.cards.height - 60); //ice overlaps the bottom of the server's cards slightly
      if (col.scored) cardsH = Math.max(cardsH, L.scored.height);
      if (col.ice) iceH = Math.max(iceH, col.ice.height);
    }
    var rowH = rootH + cardsH + iceH;
    rowGeometry.push({ rootH: rootH, cardsH: cardsH, height: rowH });
    serversHeight += rowH + gap;
  }

  var rigRowHeight = function (cascade) {
    return cascade.cards.length > 0 ? cascade.height - 70 : 0;
  };
  var rigHeight = rigRowHeight(L.programs) + rigRowHeight(L.hardware) + rigRowHeight(L.resources);
  var baseRowHeight = Math.max(L.identity.height, L.stolen.height, L.stack.height, L.heap.height, 210);

  var corpBlock = (corpView ? handZone : peekZone) + counterRow + serversHeight;
  var runnerBlock = (corpView ? peekZone : handZone) + baseRowHeight + counterRow + rigHeight;
  var contentHeight = corpBlock + runnerBlock + 120; //minimum space in the middle for resolving cards

  //ZOOM to fit (field units per CSS pixel)
  var cssW = window.innerWidth;
  var cssH = window.innerHeight;
  fieldZoom = Math.max(
    1.0,
    fieldWidth / Math.max(cssW - resLeft - resRight - 8, 1),
    contentHeight / Math.max(cssH - resTop - resBottom, 1)
  );
  var w = cssW * fieldZoom;
  var h = cssH * fieldZoom;
  cardRenderer.app.view.style.width = cssW + "px";
  cardRenderer.app.view.style.height = cssH + "px";
  cardRenderer.app.renderer.resize(w, h);
  cardRenderer.app.stage.pivot.x = w * 0.5;
  cardRenderer.app.stage.pivot.y = h * 0.5;
  cardRenderer.app.stage.x = w * 0.5;
  cardRenderer.app.stage.y = h * 0.5;

  var left = resLeft * fieldZoom;
  var right = w - resRight * fieldZoom;
  var top = resTop * fieldZoom;
  var bottom = h - resBottom * fieldZoom;
  var centreX = 0.5 * (left + right);
  var fieldLeft = centreX - 0.5 * fieldWidth;

  //CORP (top down)
  //hand centres, allowing for FanHand's offsets: the viewer's hand is mostly visible, the opponent's just peeks out
  var corpHandY = corpView ? top + 25 : top - 90;
  var corpCountersY = (corpView ? top + handZone : top + peekZone) + 10;
  var y = corpCountersY + counterRow - 10;
  var attackedServerGlow = { x: 0, y: 0 };

  for (var r = 0; r < rows.length; r++) {
    var g = rowGeometry[r];
    var x = centreX - 0.5 * rowWidth(rows[r]);
    var cardsY = y + g.rootH;
    var iceY = cardsY + g.cardsH;
    for (var i = 0; i < rows[r].length; i++) {
      var col = rows[r][i];
      var colCentre = x + 0.5 * col.width;
      if (col.scored) {
        L.scored.Apply(cardRenderer.app, x, cardsY, 0, 0, hostingX);
      } else if (col.newRemote) {
        corp.newRemoteSlot = {
          xStart: x - gap * 0.5,
          xEnd: x + col.width + gap * 0.5,
          yStart: y,
          yEnd: y + g.height,
          xCentre: colCentre,
          yCentre: cardsY + 0.5 * g.cardsH,
          selectorScaleY: g.height / 44.0,
        };
      } else {
        if (col.root) col.root.Apply(cardRenderer.app, colCentre, y, 0.5, 0, hostingX);
        col.cards.Apply(cardRenderer.app, colCentre, cardsY, 0.5, 0, hostingX, col.faceDownOffset || 0);
        col.ice.Apply(cardRenderer.app, colCentre, iceY, 0.5, 0, hostingX);
        var s = col.server;
        s.xStart = x - gap * 0.5;
        s.xEnd = x + col.width + gap * 0.5;
        s.yStart = y;
        s.yEnd = y + g.height;
        s.yCards = cardsY;
        s.yCentre = cardsY + 0.5 * g.cardsH;
        s.selectorScaleY = g.height / 44.0;
        if (attackedServer == s) {
          attackedServerGlow.x = colCentre;
          attackedServerGlow.y = s.yCentre;
        }
      }
      x += col.width + gap;
    }
    y += g.height + gap;
  }
  var corpBottom = y;
  cardRenderer.archivesIndicator.y = corp.archives.yCentre;
  if (corp.newRemoteSlot) cardRenderer.newRemoteIndicator.y = corp.newRemoteSlot.yCentre;
  cardRenderer.serverSelector.scale.y = rowGeometry[0].height / 44.0;

  //RUNNER (bottom up)
  var runnerHandY = corpView ? bottom + 90 : bottom - 25;
  var baseBottom = corpView ? bottom - peekZone : bottom - handZone;
  var baseRight = centreX + 0.5 * baseRowWidth;
  var baseLeft = centreX - 0.5 * baseRowWidth;
  L.identity.Apply(cardRenderer.app, baseLeft, baseBottom, 0, 1, hostingX);
  if (L.stolen.cards.length > 0)
    L.stolen.Apply(cardRenderer.app, baseLeft + L.identity.width + gap, baseBottom, 0, 1, hostingX);
  L.heap.Apply(cardRenderer.app, baseRight, baseBottom, 1, 1, hostingX);
  runner.heap.xStart = baseRight - L.heap.width;
  runner.heap.xEnd = baseRight;
  runner.heap.yCards = baseBottom;
  var stackRight = baseRight - L.heap.width - gap;
  L.stack.Apply(cardRenderer.app, stackRight, baseBottom, 1, 1, hostingX);
  runner.stack.xStart = stackRight - L.stack.width;
  runner.stack.xEnd = stackRight;
  runner.stack.yCards = baseBottom;

  var runnerCountersY = baseBottom - baseRowHeight - 10;
  var rigBottom = runnerCountersY - counterRow + 20;
  L.resources.Apply(cardRenderer.app, centreX, rigBottom, 0.5, 1, hostingX);
  rigBottom -= rigRowHeight(L.resources);
  L.hardware.Apply(cardRenderer.app, centreX, rigBottom, 0.5, 1, hostingX);
  rigBottom -= rigRowHeight(L.hardware);
  L.programs.Apply(cardRenderer.app, centreX, rigBottom, 0.5, 1, hostingX);
  rigBottom -= rigRowHeight(L.programs);

  //server labels and tutorial text above the field but under hands and resolving cards
  cardRenderer.serverText.rotation = corpView ? Math.PI : 0;
  cardRenderer.app.stage.addChild(cardRenderer.serverText);
  cardRenderer.tutorialText.x = left + 15;
  cardRenderer.tutorialText.y = 0.5 * (corpBottom + rigBottom);
  cardRenderer.tutorialText.rotation = corpView ? Math.PI : 0;
  if (corpView) cardRenderer.tutorialText.x = right - 15;
  if (URIParameter("t") === "1") cardRenderer.app.stage.addChild(cardRenderer.tutorialText);

  //resolving cards in the open space between the two sides
  var middleY = 0.5 * (corpBottom + rigBottom);
  L.runnerResolving.Apply(cardRenderer.app, centreX, middleY, 0.5, 0.5, hostingX);
  L.corpResolving.Apply(cardRenderer.app, centreX, middleY, 0.5, 0.5, hostingX);

  //hands last so they're on top, squeezed to fit the field width
  function fitHand(cascade) {
    var n = cascade.cards.length;
    if (n < 2) return cascade;
    var maxStep = (fieldWidth - 150) / (n - 1);
    if (Math.abs(cascade.xStep) <= maxStep) return cascade;
    return new CardRenderer.Cascade(cascade.cards, Math.sign(cascade.xStep) * maxStep, 0, hostingX);
  }
  fitHand(L.grip).Apply(cardRenderer.app, centreX, runnerHandY, 0.5, 0.5, hostingX);
  FanHand(runner);
  fitHand(L.corpHand).Apply(cardRenderer.app, centreX, corpHandY, 0.5, 0.5, hostingX);
  FanHand(corp);

  //dragging a card this far from the edge of the screen plays it
  pixi_playY = 180 + (corpView ? top : h - bottom);

  return {
    w: w,
    h: h,
    corpCounters: { right: right - 10, y: corpCountersY + 20 },
    runnerCounters: { left: left + 10, y: runnerCountersY - 20 },
    attackedServerGlow: attackedServerGlow,
  };
}
