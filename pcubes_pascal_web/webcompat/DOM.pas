unit DOM;

{$mode objfpc}{$H+}
{$modeswitch externalclass}

interface

uses JS, Web, SysUtils;

type
  DomString = String;

  TDomNode = class;
  TDomElement = class;

  TJSNamedNodeMapExt = class external name 'NamedNodeMap' (TJSObject)
  public
    function item(Index: NativeInt): TJSAttr; external name 'item';
  end;

  TDomNodeList = class
  private
    FItems: array of TDomNode;
    function GetItem(Index: NativeInt): TDomNode;
  public
    constructor Create(ANodes: TJSNodeList);
    function Count: NativeInt;
    property Items[Index: NativeInt]: TDomNode read GetItem; default;
  end;

  TDomNamedNodeMap = class
  private
    FItems: array of TDomNode;
    function GetItem(Index: NativeInt): TDomNode;
  public
    constructor Create(AAttributes: TJSNamedNodeMap);
    function Length: NativeInt;
    property Items[Index: NativeInt]: TDomNode read GetItem; default;
  end;

  TDomNode = class
  protected
    FNode: TJSNode;
  public
    constructor Create(ANode: TJSNode); virtual;
    function FindNode(const AName: String): TDomNode;
    function CompareName(const AName: String): Integer;
    function AppendChild(Node: TDomNode): TDomNode;
    function GetAttributes: TDomNamedNodeMap;
    function GetChildNodes: TDomNodeList;
    function GetParentNode: TDomNode;
    function GetNodeName: String;
    function GetNodeValue: String;
    function GetTextContent: String;
    procedure SetTextContent(const AValue: String);
    property Attributes: TDomNamedNodeMap read GetAttributes;
    property ChildNodes: TDomNodeList read GetChildNodes;
    property ParentNode: TDomNode read GetParentNode;
    property NodeName: String read GetNodeName;
    property NodeValue: String read GetNodeValue;
    property TextContent: String read GetTextContent write SetTextContent;
    property NativeNode: TJSNode read FNode;
  end;

  TDomElement = class(TDomNode)
  public
    function GetAttribute(const AName: String): String;
    procedure SetAttribute(const AName, AValue: String);
  public
    constructor Create(ANode: TJSElement); reintroduce;
    property AttribStrings[const AName: String]: String
      read GetAttribute write SetAttribute; default;
    procedure SetAttributeValue(const AName, AValue: String);
  end;

  TXmlDocument = class
  private
    FDocument: TJSDocument;
    function GetDocumentElement: TDomElement;
  public
    constructor Create(ADocument: TJSDocument);
    function CreateElement(const AName: String): TDomElement;
    function AppendChild(Node: TDomNode): TDomNode;
    procedure Free;
    property DocumentElement: TDomElement read GetDocumentElement;
  end;

function WrapDomNode(ANode: TJSNode): TDomNode;

implementation

constructor TDomNodeList.Create(ANodes: TJSNodeList);
var
  I: NativeInt;
begin
  inherited Create;
  SetLength(FItems, ANodes.length);
  for I := 0 to ANodes.length - 1 do
    FItems[I] := WrapDomNode(ANodes.item(I));
end;

function TDomNodeList.GetItem(Index: NativeInt): TDomNode;
begin
  // DOM lists are snapshots. Callers sometimes retain a list while the
  // underlying document is edited, so never let a stale/out-of-range index
  // escape as the generic EArgumentOutOfRangeException from a dynamic array.
  if (Index < 0) or (Index >= Length(FItems)) then
    Exit(nil);
  Result := FItems[Index];
end;

function TDomNodeList.Count: NativeInt;
begin
  Result := Length(FItems);
end;

constructor TDomNamedNodeMap.Create(AAttributes: TJSNamedNodeMap);
var
  I, N: NativeInt;
begin
  inherited Create;
  if AAttributes = nil then N := 0
  else N := NativeInt(TJSObject(AAttributes)['length']);
  SetLength(FItems, N);
  for I := 0 to N - 1 do
    FItems[I] := TDomNode.Create(TJSNode(TJSNamedNodeMapExt(AAttributes).item(I)));
end;

function TDomNamedNodeMap.GetItem(Index: NativeInt): TDomNode;
begin
  // Match the browser NamedNodeMap.item() contract: invalid indexes return nil.
  if (Index < 0) or (Index >= Length(FItems)) then
    Exit(nil);
  Result := FItems[Index];
end;

function TDomNamedNodeMap.Length: NativeInt;
begin
  Result := Length(FItems);
end;

constructor TDomNode.Create(ANode: TJSNode);
begin
  inherited Create;
  FNode := ANode;
end;

function WrapDomNode(ANode: TJSNode): TDomNode;
begin
  if ANode = nil then Exit(nil);
  if ANode.nodeType = 1 then
    Result := TDomElement.Create(TJSElement(ANode))
  else
    Result := TDomNode.Create(ANode);
end;

function TDomNode.FindNode(const AName: String): TDomNode;
var
  I: Integer;
  Nodes: TDomNodeList;
  Child: TDomNode;
begin
  Result := nil;
  Nodes := ChildNodes;
  for I := 0 to Nodes.Count - 1 do begin
    Child := Nodes[I];
    if SameText(Child.NodeName, AName) then Exit(Child);
  end;
end;

function TDomNode.CompareName(const AName: String): Integer;
begin
  if SameText(NodeName, AName) then Result := 0 else Result := 1;
end;

function TDomNode.AppendChild(Node: TDomNode): TDomNode;
begin
  Result := WrapDomNode(FNode.appendChild(Node.NativeNode));
end;

function TDomNode.GetAttributes: TDomNamedNodeMap;
begin
  if FNode.nodeType = 1 then
    Result := TDomNamedNodeMap.Create(TJSElement(FNode).attributes)
  else
    Result := TDomNamedNodeMap.Create(nil);
end;

function TDomNode.GetChildNodes: TDomNodeList;
begin
  Result := TDomNodeList.Create(FNode.childNodes);
end;

function TDomNode.GetParentNode: TDomNode;
begin
  Result := WrapDomNode(FNode.parentNode);
end;

function TDomNode.GetNodeName: String;
begin
  Result := FNode.nodeName;
end;

function TDomNode.GetNodeValue: String;
begin
  Result := FNode.nodeValue;
end;

function TDomNode.GetTextContent: String;
begin
  Result := FNode.textContent;
end;

procedure TDomNode.SetTextContent(const AValue: String);
begin
  FNode.textContent := AValue;
end;

constructor TDomElement.Create(ANode: TJSElement);
begin
  inherited Create(ANode);
end;

function TDomElement.GetAttribute(const AName: String): String;
begin
  // Browser Element.getAttribute returns null for a missing attribute.
  // Assigning that null directly to a Pascal String makes the generated
  // conversion call String.replace on null in the Pas2JS runtime.
  if not TJSElement(FNode).hasAttribute(AName) then
    Result := ''
  else
    Result := TJSElement(FNode).getAttribute(AName);
end;

procedure TDomElement.SetAttribute(const AName, AValue: String);
begin
  TJSElement(FNode).setAttribute(AName, AValue);
end;

procedure TDomElement.SetAttributeValue(const AName, AValue: String);
begin
  SetAttribute(AName, AValue);
end;

constructor TXmlDocument.Create(ADocument: TJSDocument);
begin
  inherited Create;
  FDocument := ADocument;
end;

function TXmlDocument.GetDocumentElement: TDomElement;
begin
  Result := TDomElement(WrapDomNode(FDocument.documentElement));
end;

function TXmlDocument.CreateElement(const AName: String): TDomElement;
begin
  Result := TDomElement.Create(FDocument.createElement(AName));
end;

function TXmlDocument.AppendChild(Node: TDomNode): TDomNode;
begin
  Result := WrapDomNode(FDocument.appendChild(Node.NativeNode));
end;

procedure TXmlDocument.Free;
begin
  { Native browser documents are garbage-collected by JavaScript. }
end;

end.
