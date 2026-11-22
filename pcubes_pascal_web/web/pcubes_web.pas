program pcubes_web;
{$mode objfpc}{$H+}
{ Browser bridge for the original Pascal pCubes puzzle model. }
uses JS, Web, SysUtils, Classes, DOM, XMLRead, uPuzzle, uXmlReadWrite;
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
begin Result := '0.2.0'; end;

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
  else SetStatus('Reset adapter is not implemented yet.');
end;

procedure APIOpenLibrary;
begin SetStatus('Puzzle library is not ported to the browser yet.'); end;

function APILoadXML(const XmlText: String): Boolean;
var
  Stream: TStringStream;
  XmlDoc: TXMLDocument;
  NewPuzzle: TPuzzle;
begin
  Result := False;
  if Trim(XmlText) = '' then begin
    SetStatus('XML load failed: selected file is empty.');
    Exit;
  end;

  Stream := TStringStream.Create(XmlText);
  XmlDoc := nil;
  NewPuzzle := nil;
  try
    ReadXMLFile(XmlDoc, Stream);
    if (XmlDoc = nil) or (XmlDoc.DocumentElement = nil) then
      raise Exception.Create('The XML document has no root element.');
    NewPuzzle := TPuzzle.Create;
    NewPuzzle.DisableAnimation;
    if not TXmlReadWrite.PuzzleLoadFromXml(NewPuzzle, XmlDoc.DocumentElement) then
      raise Exception.Create('The XML is valid, but pCubes could not load its puzzle data.');

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
  if XmlDoc <> nil then XmlDoc.Free;
  Stream.Free;
end;

procedure InstallBrowserAPI;
begin
  API := new([]);
  API['version'] := '0.2.0';
  API['getStatus'] := TJSFunction(@APIGetStatus);
  API['getVersion'] := TJSFunction(@APIGetVersion);
  API['isPuzzleReady'] := TJSFunction(@APIIsPuzzleReady);
  API['getModelInfo'] := TJSFunction(@APIGetModelInfo);
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
