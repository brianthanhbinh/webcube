program pcubes_web;
{$mode objfpc}{$H+}
{ Browser bridge for the original Pascal pCubes puzzle model. }
uses JS, Web, SysUtils, DOM, uPuzzle, uXmlReadWrite, uPart, uFace, uVector;
var
  StatusNode: TJSElement;
  API: TJSObject;
  CurrentPuzzle: TPuzzle;

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
begin Result := '0.3.0'; end;

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

function APIGetRenderData: TJSObject;
var
  FacesArray, FaceObject, VerticesArray, VertexArray: TJSArray;
  Part: TPart;
  Face: TFace;
  V: TVector;
  I, J: Integer;
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
              VertexArray.push(V.X);
              VertexArray.push(V.Y);
              VertexArray.push(V.Z);
              VerticesArray.push(VertexArray);
            end;
            FaceObject['vertices'] := VerticesArray;
            FaceObject['color'] := Face.Color;
            FacesArray.push(FaceObject);
          end;
  Result['faces'] := FacesArray;
end;

procedure APIScramble;
begin
  if not APIIsPuzzleReady then begin SetStatus('Scramble unavailable: load a valid puzzle XML first.'); Exit; end;
  CurrentPuzzle.DisableAnimation; CurrentPuzzle.Scramble;
  SetStatus('Scrambled using the original Pascal TPuzzle engine.');
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

procedure APIReset;
begin
  if not APIIsPuzzleReady then SetStatus('Reset unavailable: no puzzle is loaded.')
  else SetStatus('Reset requires the original puzzle XML; use the Reset control to reload it.');
end;

procedure APIOpenLibrary;
begin SetStatus('Choose a puzzle XML file to load a puzzle.'); end;

function APILoadXML(XmlRoot: TJSObject): Boolean;
var
  NewPuzzle: TPuzzle;
begin
  Result := False;
  if XmlRoot = nil then begin
    SetStatus('XML load failed: no XML root element was supplied.');
    Exit;
  end;

  NewPuzzle := TPuzzle.Create;
  try
    NewPuzzle.DisableAnimation;
    if not TXmlReadWrite.PuzzleLoadFromXml(NewPuzzle, WrapDomNode(TJSNode(XmlRoot))) then begin
      SetStatus('XML load failed: pCubes rejected the puzzle definition.');
      Exit;
    end;

    if (NewPuzzle.Parts.Count = 0) or (NewPuzzle.Axes.Count = 0) then begin
      SetStatus('XML load failed: the file contains no usable puzzle parts or axes.');
      Exit;
    end;

    if CurrentPuzzle <> nil then CurrentPuzzle.Free;
    CurrentPuzzle := NewPuzzle;
    NewPuzzle := nil;
    SetStatus('Loaded "' + CurrentPuzzle.Header.Name + '" from XML (' +
      IntToStr(CurrentPuzzle.Parts.Count) + ' parts, ' +
      IntToStr(CurrentPuzzle.Axes.Count) + ' axes).');
    Result := True;
  except
    on E: Exception do
      SetStatus('XML load failed: ' + E.Message);
  end;
  if NewPuzzle <> nil then NewPuzzle.Free;
end;

procedure InstallBrowserAPI;
begin
  API := new([]);
  API['version'] := '0.3.0';
  API['getStatus'] := TJSFunction(@APIGetStatus);
  API['getVersion'] := TJSFunction(@APIGetVersion);
  API['isPuzzleReady'] := TJSFunction(@APIIsPuzzleReady);
  API['getModelInfo'] := TJSFunction(@APIGetModelInfo);
  API['getRenderData'] := TJSFunction(@APIGetRenderData);
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
  CurrentPuzzle.DisableAnimation;
  InstallBrowserAPI;
  SetStatus('Pascal TPuzzle model instantiated. Load a puzzle definition to begin.');
end.
