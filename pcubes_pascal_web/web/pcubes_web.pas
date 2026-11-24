program pcubes_web;
{$mode objfpc}{$H+}
{ Browser bridge for the original Pascal pCubes puzzle model. }
uses JS, Web, SysUtils, Math, DOM, uPuzzle, uXmlReadWrite, uPart, uFace, uVector, uAxis;
var
  StatusNode: TJSElement;
  API: TJSObject;
  CurrentPuzzle: TPuzzle;
  OriginalXmlRoot: TJSObject;

procedure SetStatus(const S: String);
begin
  StatusNode := document.getElementById('engine-status');
  if StatusNode <> nil then StatusNode.textContent := S;
end;

function APIGetStatus: String;
begin
  if CurrentPuzzle = nil then Result := 'Pascal bridge online; puzzle model unavailable'
  else if (CurrentPuzzle.Axes.Count = 0) or (CurrentPuzzle.Parts.Count = 0) then
    Result := 'Pascal puzzle model connected; no puzzle loaded'
  else Result := 'Pascal puzzle model loaded (' + IntToStr(CurrentPuzzle.Parts.Count) +
    ' parts, ' + IntToStr(CurrentPuzzle.Axes.Count) + ' axes)';
end;

function APIGetVersion: String;
begin Result := '0.3.1'; end;

function APIIsPuzzleReady: Boolean;
begin
  Result := (CurrentPuzzle <> nil) and (CurrentPuzzle.Axes.Count > 0) and
    (CurrentPuzzle.Parts.Count > 0);
end;

function APIGetModelInfo: TJSObject;
begin
  Result := new([]);
  Result['connected'] := CurrentPuzzle <> nil;
  Result['ready'] := APIIsPuzzleReady;
  if CurrentPuzzle <> nil then begin
    Result['parts'] := CurrentPuzzle.Parts.Count;
    Result['axes'] := CurrentPuzzle.Axes.Count;
    Result['undoCount'] := CurrentPuzzle.UndoCount;
    Result['redoCount'] := CurrentPuzzle.RedoStack.Count;
    Result['name'] := CurrentPuzzle.Header.Name;
  end else begin
    Result['parts'] := 0; Result['axes'] := 0;
    Result['undoCount'] := 0; Result['redoCount'] := 0; Result['name'] := '';
  end;
end;

function APIGetAxesInfo: TJSArray;
var I: Integer; AxisInfo: TJSObject;
begin
  Result := TJSArray.new;
  if CurrentPuzzle = nil then Exit;
  for I := 0 to CurrentPuzzle.Axes.Count - 1 do begin
    if (Abs(CurrentPuzzle.Axes[I].NormVector.X) + Abs(CurrentPuzzle.Axes[I].NormVector.Y) + Abs(CurrentPuzzle.Axes[I].NormVector.Z)) < 0.0001 then Continue;
    AxisInfo := TJSObject.new;
    AxisInfo['index'] := I;
    AxisInfo['layers'] := CurrentPuzzle.Axes[I].Layers.Count;
    AxisInfo['x'] := CurrentPuzzle.Axes[I].NormVector.X;
    AxisInfo['y'] := CurrentPuzzle.Axes[I].NormVector.Y;
    AxisInfo['z'] := CurrentPuzzle.Axes[I].NormVector.Z;
    AxisInfo['enabled'] := CurrentPuzzle.Axes[I].Enabled;
    AxisInfo['layerCount'] := CurrentPuzzle.Axes[I].Layers.Count;
    if CurrentPuzzle.Axes[I].Layers.Count > 0 then AxisInfo['angle'] := CurrentPuzzle.Axes[I].Layers[0].TurningAngle;
    Result.push(AxisInfo);
  end;
end;

function APITurnLayer(AxisNo, LayerNo, Direction: Integer): Boolean;
var BeforeCount: Integer; Angle: Extended;
begin
  Result := False;
  if not APIIsPuzzleReady then Exit;
  if (AxisNo < 0) or (AxisNo >= CurrentPuzzle.Axes.Count) then Exit;
  if (LayerNo < 0) or (LayerNo >= CurrentPuzzle.Axes[AxisNo].Layers.Count) then Exit;
  if (Direction <> -1) and (Direction <> 1) then Exit;
  if not CurrentPuzzle.Axes[AxisNo].Enabled then Exit;
  if CurrentPuzzle.Axes[AxisNo].Layers[LayerNo].Fixed then Exit;
  Angle := CurrentPuzzle.Axes[AxisNo].Layers[LayerNo].TurningAngle;
  if Abs(Angle) < 0.000001 then Exit;
  BeforeCount := CurrentPuzzle.UndoCount;
  CurrentPuzzle.RotateLayer(AxisNo, LayerNo, Angle * Direction, True);
  Result := CurrentPuzzle.UndoCount > BeforeCount;
end;

function APIScramble: Boolean;
var I, AxisNo, LayerNo, Direction, Turns, BeforeCount, PreviousAxis, PreviousLayer, PreviousDirection: Integer;
    Angle: Extended; Attempts: Integer;
begin
  Result := False;
  if not APIIsPuzzleReady then begin
    SetStatus('Scramble unavailable: load a valid puzzle XML first.');
    Exit;
  end;
  Turns := 0;
  PreviousAxis := -1; PreviousLayer := -1; PreviousDirection := 0;
  for I := 1 to 30 do begin
    Attempts := 0;
    repeat
      Inc(Attempts);
      AxisNo := Random(CurrentPuzzle.Axes.Count);
      if CurrentPuzzle.Axes[AxisNo].Layers.Count = 0 then Continue;
      LayerNo := Random(CurrentPuzzle.Axes[AxisNo].Layers.Count);
      Direction := Random(2) * 2 - 1;
      if (AxisNo = PreviousAxis) and (LayerNo = PreviousLayer) and
         (Direction = -PreviousDirection) then Continue;
      Break;
    until Attempts >= 100;
    if Attempts >= 100 then Continue;
    if (Abs(CurrentPuzzle.Axes[AxisNo].NormVector.X) + Abs(CurrentPuzzle.Axes[AxisNo].NormVector.Y) + Abs(CurrentPuzzle.Axes[AxisNo].NormVector.Z)) < 0.0001 then Continue;
    if not CurrentPuzzle.Axes[AxisNo].Enabled then Continue;
    if CurrentPuzzle.Axes[AxisNo].Layers[LayerNo].Fixed then Continue;
    Angle := CurrentPuzzle.Axes[AxisNo].Layers[LayerNo].TurningAngle;
    if Abs(Angle) < 0.000001 then Continue;
    BeforeCount := CurrentPuzzle.UndoCount;
    CurrentPuzzle.RotateLayer(AxisNo, LayerNo, Angle * Direction, True);
    if CurrentPuzzle.UndoCount > BeforeCount then begin
      Inc(Turns);
      PreviousAxis := AxisNo; PreviousLayer := LayerNo; PreviousDirection := Direction;
    end;
  end;
  Result := Turns > 0;
  if Result then SetStatus('Scrambled: ' + IntToStr(Turns) + ' layer moves.')
  else SetStatus('Scramble failed: this puzzle has no movable layers.');
end;

function APIGetRenderData: TJSObject;
var
  FacesArray, VerticesArray, VertexArray: TJSArray;
  FaceObject: TJSObject;
  Part: TPart;
  Face: TFace;
  V: TVector;
  I: Integer;
begin
  Result := new([]);
  FacesArray := TJSArray.new;
  if CurrentPuzzle <> nil then
    for Part in CurrentPuzzle.Parts do
      if Part.Visible then
        for Face in Part.Faces do
          if Face.GetVertexCount >= 3 then begin
            FaceObject := TJSObject.new;
            VerticesArray := TJSArray.new;
            for I := 0 to Face.GetVertexCount - 1 do begin
              V := Face.GetVertex(I);
              VertexArray := TJSArray.new;
              VertexArray.push(V.X); VertexArray.push(V.Y); VertexArray.push(V.Z);
              VerticesArray.push(VertexArray);
            end;
            FaceObject['vertices'] := VerticesArray;
            FaceObject['color'] := Face.Color;
            FacesArray.push(FaceObject);
          end;
  Result['faces'] := FacesArray;
end;

procedure APIUndo;
begin
  if APIIsPuzzleReady and CurrentPuzzle.Undo(False) then SetStatus('Undo performed by Pascal TPuzzle.')
  else SetStatus('Nothing to undo.');
end;

procedure APIRedo;
begin
  if APIIsPuzzleReady and CurrentPuzzle.Redo(False) then SetStatus('Redo performed by Pascal TPuzzle.')
  else SetStatus('Nothing to redo.');
end;

function APILoadXML(XmlRoot: TJSObject): Boolean; forward;

procedure APIReset;
begin
  if OriginalXmlRoot = nil then begin
    SetStatus('Reset unavailable: no original puzzle XML has been loaded.');
    Exit;
  end;
  if APILoadXML(OriginalXmlRoot) then SetStatus('Puzzle reset to its original XML state.');
end;

procedure APIOpenLibrary;
begin SetStatus('Choose a puzzle XML file to load a puzzle.'); end;

procedure ConfigureStandardCube(Puzzle: TPuzzle);
var I, J: Integer; Distances: array of Extended; PuzzleName: String;
begin
  PuzzleName := Puzzle.Header.Name;
  if Pos('3x3x3', PuzzleName) > 0 then begin
    SetLength(Distances, 2); Distances[0] := -1/6; Distances[1] := 1/6;
  end else if Pos('2x2x2', PuzzleName) > 0 then begin
    SetLength(Distances, 1); Distances[0] := 0;
  end else Exit;
  for I := 0 to Puzzle.Axes.Count - 1 do begin
    if (Abs(Puzzle.Axes[I].NormVector.X) + Abs(Puzzle.Axes[I].NormVector.Y) +
        Abs(Puzzle.Axes[I].NormVector.Z)) < 0.0001 then Continue;
    Puzzle.Axes[I].CreateLayers(Distances);
    for J := 0 to Puzzle.Axes[I].Layers.Count - 1 do
      Puzzle.Axes[I].Layers[J].TurningAngle := Pi/2;
  end;
  Puzzle.PositionsInvalidate;
end;

function APILoadXML(XmlRoot: TJSObject): Boolean;
var NewPuzzle: TPuzzle;
begin
  Result := False;
  if XmlRoot = nil then begin SetStatus('XML load failed: no XML root element was supplied.'); Exit; end;
  NewPuzzle := TPuzzle.Create;
  try
    NewPuzzle.DisableAnimation;
    if not TXmlReadWrite.PuzzleLoadFromXml(NewPuzzle, WrapDomNode(TJSNode(XmlRoot))) then begin
      SetStatus('XML load failed: pCubes rejected the puzzle definition.'); Exit;
    end;
    ConfigureStandardCube(NewPuzzle);
    if (NewPuzzle.Parts.Count = 0) or (NewPuzzle.Axes.Count = 0) then begin
      SetStatus('XML load failed: the file contains no usable puzzle parts or axes.'); Exit;
    end;
    if CurrentPuzzle <> nil then CurrentPuzzle.Free;
    CurrentPuzzle := NewPuzzle; OriginalXmlRoot := XmlRoot; NewPuzzle := nil;
    SetStatus('Loaded "' + CurrentPuzzle.Header.Name + '" from XML (' +
      IntToStr(CurrentPuzzle.Parts.Count) + ' parts, ' + IntToStr(CurrentPuzzle.Axes.Count) + ' axes).');
    Result := True;
  except
    on E: Exception do SetStatus('XML load failed: ' + E.Message);
  end;
  if NewPuzzle <> nil then NewPuzzle.Free;
end;

procedure InstallBrowserAPI;
begin
  API := new([]);
  API['version'] := '0.3.1';
  API['getStatus'] := TJSFunction(@APIGetStatus);
  API['getVersion'] := TJSFunction(@APIGetVersion);
  API['isPuzzleReady'] := TJSFunction(@APIIsPuzzleReady);
  API['getModelInfo'] := TJSFunction(@APIGetModelInfo);
  API['getRenderData'] := TJSFunction(@APIGetRenderData);
  API['getAxesInfo'] := TJSFunction(@APIGetAxesInfo);
  API['turnLayer'] := TJSFunction(@APITurnLayer);
  API['scramble'] := TJSFunction(@APIScramble);
  API['undo'] := TJSFunction(@APIUndo);
  API['redo'] := TJSFunction(@APIRedo);
  API['reset'] := TJSFunction(@APIReset);
  API['openLibrary'] := TJSFunction(@APIOpenLibrary);
  API['loadXML'] := TJSFunction(@APILoadXML);
  window['pCubes'] := API;
end;

begin
  CurrentPuzzle := TPuzzle.Create;
  OriginalXmlRoot := nil;
  CurrentPuzzle.DisableAnimation;
  InstallBrowserAPI;
  SetStatus('Pascal TPuzzle model instantiated. Load a puzzle definition to begin.');
end.
